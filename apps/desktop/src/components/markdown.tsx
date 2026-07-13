import { createMemo } from "solid-js";
import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * Agent output is markdown — the prototype renders it, so the Work register
 * and system notes do too. Sanitized, because an agent's reply is untrusted
 * text that may quote a web page or a file.
 */
marked.setOptions({ breaks: true, gfm: true });

export function Markdown(props: { content: string }) {
  const html = createMemo(() =>
    DOMPurify.sanitize(marked.parse(props.content ?? "", { async: false }) as string),
  );
  return <div class="aular-markdown" data-selectable innerHTML={html()} />;
}
