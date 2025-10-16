# WordDistance Game (PWA)

Find a word that is as far away as possible in embedding space. Built with Next.js, TypeScript, and Tailwind.

## Getting started

```powershell
npm install
npm run dev
```

Open http://localhost:3000

## Embedding data format

We support two formats under `public/embeddings/<name>`:

1) JSON demo (small only)
- `tokens.json`: ["word1", "word2", ...]
- `embeddings.json`: number[][] with shape [count][dims]

2) Binary fp32 (recommended for large sets)
- `meta.json`: { "dims": number, "count": number, "format": "fp32" }
- `tokens.json`: same as above
- `embeddings.bin`: Float32Array of length `count * dims` in row-major order

The app checks `meta.json`; if present and `embeddings.bin` exists, it loads binary via a Web Worker, otherwise falls back to JSON.
