/** Offers bytes or text to the visitor as a file download. Nothing leaves the browser. */
export function download(name: string, data: Uint8Array | string, type = "application/octet-stream"): void {
  const blob = new Blob([typeof data === "string" ? data : data.slice()], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
