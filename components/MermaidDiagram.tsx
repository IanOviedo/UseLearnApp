"use client";
import { useEffect, useRef, useState, useId } from "react";
import mermaid from "mermaid";

interface MermaidDiagramProps {
  diagram: string;
}

export default function MermaidDiagram({ diagram }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId();

  // Initialize Mermaid once
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false });
  }, []);

  useEffect(() => {
    if (!diagram) return;
    (async () => {
      try {
        const result = await mermaid.render(uniqueId, diagram);
        setSvg(result.svg);
        setError(null);
      } catch (e: any) {
        setError(e?.message || "Unknown error rendering Mermaid diagram");
        setSvg(null);
      }
    })();
  }, [diagram, uniqueId]);

  if (error) {
    return <div style={{ color: "red" }}>{error}</div>;
  }

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg ?? "" }} />;
}
