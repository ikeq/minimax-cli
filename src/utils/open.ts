export async function openBrowser(url: string): Promise<void> {
  const { platform } = process;
  const { exec } = await import('node:child_process');

  const cmd =
    platform === 'darwin'
      ? 'open'
      : platform === 'win32'
        ? 'start'
        : 'xdg-open';

  return new Promise((resolve, reject) => {
    exec(`${cmd} '${url}'`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
