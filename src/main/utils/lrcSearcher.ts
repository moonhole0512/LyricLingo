import https from 'https';
import { areLyricsEquivalent } from './lyricsParser';
import { appendDebugLog } from './logger';

export function logLrcDebug(category: string, ...args: any[]) {
  const msg = `[${category}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
  console.log(msg);
  appendDebugLog(msg);
}

export const normText = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ヶｦ-ﾟ一-龠]/g, '');

export const isTitleArtistMatch = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const nA = normText(a);
  const nB = normText(b);
  if (nA.length === 0 || nB.length === 0) return false;
  if (nA.length < 4 || nB.length < 4) return nA === nB;
  return nA.includes(nB) || nB.includes(nA);
};

export const scoreLrcText = (lrc: string): number => {
  if (!lrc) return 0;
  const matches = lrc.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\uAC00-\uD7AF]/g);
  return matches ? matches.length : 0;
};

export function rankLrcCandidates(candidates: any[], targetDuration?: number): any[] {
  const sorted = [...candidates];
  if (targetDuration && targetDuration > 0) {
    sorted.sort((a: any, b: any) => {
      const diffA = Math.abs((a.duration || 0) - targetDuration);
      const diffB = Math.abs((b.duration || 0) - targetDuration);
      // If difference between diffA and diffB is > 1.0s, strictly sort by closest duration!
      if (Math.abs(diffA - diffB) > 1.0) {
        return diffA - diffB;
      }
      // If within 1 second of each other, use CJK richness as tiebreaker
      const scoreDiff = scoreLrcText(b.syncedLyrics) - scoreLrcText(a.syncedLyrics);
      if (scoreDiff !== 0) return scoreDiff;
      return diffA - diffB;
    });
  } else {
    sorted.sort((a: any, b: any) => scoreLrcText(b.syncedLyrics) - scoreLrcText(a.syncedLyrics));
  }
  return sorted;
}

function httpGetJson(url: string, headers: Record<string, string> = {}, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve) => {
    const req = https.get(url, { headers, timeout: timeoutMs }, (res: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.parse(raw));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', (err: any) => {
      logLrcDebug('LRC Search Network Error', url, err?.message || err);
      resolve(null);
    });
  });
}

export const fetchItunesTrack = async (query: string, country?: string): Promise<any> => {
  const countryParam = country ? `&country=${country}` : '';
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1${countryParam}`;
  const data = await httpGetJson(url);
  return data?.results?.[0] || null;
};

export const fetchItunesArtist = async (artist: string, country?: string): Promise<any> => {
  const countryParam = country ? `&country=${country}` : '';
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=musicArtist&limit=1${countryParam}`;
  const data = await httpGetJson(url);
  return data?.results?.[0] || null;
};

export const fetchLrcLibQuery = async (query: string): Promise<any[]> => {
  const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
  const data = await httpGetJson(url, { 'User-Agent': 'LyricLingo/1.0.0' });
  return Array.isArray(data) ? data : [];
};

export async function searchLrcCandidates(searchTitle: string, searchArtist?: string, targetDuration?: number): Promise<any[]> {
  const cleanTitle = (searchTitle || '').trim();
  const cleanArtist = (searchArtist || '').split(' — ')[0].trim();

  logLrcDebug('LRC Search', `Starting candidate search for: "${cleanTitle}" by "${cleanArtist}" (duration: ${targetDuration || 'N/A'})`);

  try {
    const validTitles: string[] = [cleanTitle];
    const validArtists: string[] = cleanArtist ? [cleanArtist] : [];

    const titleWithoutPunc = cleanTitle.replace(/[,.—\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    if (titleWithoutPunc && titleWithoutPunc !== cleanTitle) {
      validTitles.push(titleWithoutPunc);
    }

    // Resolve iTunes track & artist mappings (try default and JP/KR stores)
    const itunesPromises: Promise<any>[] = [
      fetchItunesTrack(`${cleanTitle} ${cleanArtist}`.trim()),
      fetchItunesTrack(cleanTitle, 'JP')
    ];
    if (cleanArtist) {
      itunesPromises.push(fetchItunesArtist(cleanArtist, 'JP'));
      itunesPromises.push(fetchItunesArtist(cleanArtist, 'US'));
    }

    const itunesResults = await Promise.all(itunesPromises);
    const itunesTrackDefault = itunesResults[0];
    const itunesTrackJp = itunesResults[1];
    const itunesArtistJp = itunesResults[2];
    const itunesArtistUs = itunesResults[3];

    for (const t of [itunesTrackDefault, itunesTrackJp]) {
      if (t?.trackName && !validTitles.includes(t.trackName)) {
        validTitles.push(t.trackName);
      }
      if (t?.artistName && !validArtists.includes(t.artistName)) {
        validArtists.push(t.artistName);
      }
    }
    for (const a of [itunesArtistJp, itunesArtistUs]) {
      if (a?.artistName && !validArtists.includes(a.artistName)) {
        validArtists.push(a.artistName);
      }
    }

    logLrcDebug('LRC Search Metadata', { validTitles, validArtists });

    // Build search queries
    const querySet = new Set<string>();
    if (cleanArtist) {
      querySet.add(`${cleanTitle} ${cleanArtist}`);
      if (titleWithoutPunc) querySet.add(`${titleWithoutPunc} ${cleanArtist}`);
    }
    querySet.add(cleanTitle);
    if (titleWithoutPunc) querySet.add(titleWithoutPunc);

    for (const t of validTitles) {
      for (const a of validArtists) {
        querySet.add(`${t} ${a}`);
      }
      querySet.add(t);
    }

    const queries = Array.from(querySet).filter(Boolean);
    logLrcDebug('LRC Search Queries', queries);

    const lrcLibResults = await Promise.all(queries.map(q => fetchLrcLibQuery(q)));

    const seenIds = new Set<number>();
    const strictMatches: any[] = [];
    const titleOnlyMatches: any[] = [];

    for (const items of lrcLibResults) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item?.syncedLyrics || seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        const titleMatch = validTitles.some(t => isTitleArtistMatch(item.trackName, t));
        if (!titleMatch) continue;

        const artistMatch = validArtists.length === 0 || validArtists.some(a => isTitleArtistMatch(item.artistName, a));
        if (artistMatch) {
          strictMatches.push(item);
        } else {
          titleOnlyMatches.push(item);
        }
      }
    }

    logLrcDebug('LRC Search Matches', `Strict matches: ${strictMatches.length}, Title-only matches: ${titleOnlyMatches.length}`);

    // If an artist was provided, strictly return matches that match the artist.
    // Unrelated artists must never be returned or auto-selected as lyrics.
    const rankedStrict = rankLrcCandidates(strictMatches, targetDuration);
    const rankedTitleOnly = rankLrcCandidates(titleOnlyMatches, targetDuration);
    const candidatesToDedupe = validArtists.length > 0 ? rankedStrict : rankedTitleOnly;

    // Deduplicate candidates that have equivalent lyrics (keeping the highest-ranked one)
    const finalCandidates: any[] = [];
    for (const item of candidatesToDedupe) {
      if (!finalCandidates.some((existing) => areLyricsEquivalent(existing.syncedLyrics, item.syncedLyrics))) {
        finalCandidates.push(item);
      }
    }

    logLrcDebug('LRC Search Complete', `Total candidates: ${finalCandidates.length}. Best match: "${finalCandidates[0]?.trackName || 'None'}" by "${finalCandidates[0]?.artistName || 'None'}"`);

    return finalCandidates;
  } catch (e) {
    logLrcDebug('LRC Search Fatal Error', e);
    return [];
  }
}
