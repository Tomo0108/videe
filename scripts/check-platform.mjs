const target = process.argv[2];
if (process.platform !== target) {
  console.error(`This package must be built on ${target}. FFmpeg is platform-specific; building on ${process.platform} would bundle the wrong video engine.`);
  process.exit(1);
}
