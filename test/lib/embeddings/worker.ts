// Web Worker to parse binary embeddings without blocking the UI
// Message contract: { type: 'load-binary', urlBin: string, dims: number, count: number }
// Response: { type: 'loaded', vectors: Float32Array }
self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data;
  if (msg?.type === 'load-binary') {
    const res = await fetch(msg.urlBin);
    const buf = await res.arrayBuffer();
    const vectors = new Float32Array(buf);
    // Optionally validate length: dims*count
    // postMessage cannot transfer typed arrays by default; transfer buffer
    // @ts-ignore
    postMessage({ type: 'loaded', vectors: { buffer: vectors.buffer, byteOffset: 0, byteLength: vectors.byteLength } }, [vectors.buffer]);
  }
};
