import { Highlight, themes } from "prism-react-renderer";
import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, FileData } from "./types.js";

export function GitlabFile({ data, error }: ComponentPayload<FileData>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  if (data.kind === "markdown") {
    return <div className="gitlab-readme" dangerouslySetInnerHTML={{ __html: data.html }} />;
  }
  return (
    <div className="gitlab-code">
      <div className="gitlab-code-title">{data.path}</div>
      <Highlight code={data.code.replace(/\n$/, "")} language={data.language} theme={themes.github}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`${className} gitlab-code-pre`} style={style}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
