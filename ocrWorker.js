self.importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

self.onmessage = async function(e) {
  let { image } = e.data;

  try {
    let res = await Tesseract.recognize(image, 'eng');

    self.postMessage({
      text: res.data.text,
      confidence: res.data.confidence
    });

  } catch (err) {
    self.postMessage({ error: true });
  }
};
