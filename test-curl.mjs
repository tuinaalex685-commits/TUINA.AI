async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/etude/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: '2bffa4dc-1f99-4249-be9d-b442475296cf' })
    });
    console.log("STATUS:", res.status);
    const data = await res.text();
    console.log("RESPONSE:", data);
  } catch (err) {
    console.error("FETCH ERROR:", err);
  }
}
test();
