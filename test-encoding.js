const dir = 'D:\\Code\\youtube_mover';
console.log('Original:', dir);
console.log('Length:', dir.length);

let backslashCount = 0;
for (const c of dir) {
  if (c === '\\') backslashCount++;
}
console.log('Backslashes:', backslashCount);

const encoded = encodeURIComponent(dir);
console.log('Encoded:', encoded);
console.log('Encoded length:', encoded.length);

const decoded = decodeURIComponent(encoded);
console.log('Decoded:', decoded);
console.log('Decoded length:', decoded.length);
console.log('Match:', dir === decoded);
