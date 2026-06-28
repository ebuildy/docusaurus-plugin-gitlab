import React from "react";

export default function CodeBlock({
  children,
  language,
  title,
}: {
  language?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <pre data-language={language} data-title={title}>
      {children}
    </pre>
  );
}
