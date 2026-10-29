// Word counting used by the browser, the server and (as a copy) the Edge Function.
export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;
