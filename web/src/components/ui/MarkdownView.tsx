import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
  className?: string;
};

export function MarkdownView({ content, className = "" }: Props) {
  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
