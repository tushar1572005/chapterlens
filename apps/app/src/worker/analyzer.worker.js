import { analyze } from '@chapterlens/analyzer';

self.onmessage = (event) => {
  const { id, text } = event.data;
  try {
    const result = analyze(text);
    self.postMessage({ id, success: true, result });
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
