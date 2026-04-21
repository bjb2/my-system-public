import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { ViewProps } from "../components/ViewProps";
import DocViewer from "../components/DocViewer";

interface Node extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  type: string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
}

export default function GraphView({ docs, theme, selectedDoc, setSelectedDoc, onOpenUrl }: ViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const { nodes, links } = useMemo(() => {
    const docMap = new Map(docs.map(d => [d.filename.replace(".md", ""), d]));
    const nodes: Node[] = docs.map(d => ({
      id: d.filename.replace(".md", ""),
      title: d.title,
      type: d.type,
    }));
    // Resolve a wikilink to a docMap key. Handles both bare filenames and
    // path-style links like [[../../tasks/some-task]] or [[tasks/some-task.md]].
    const resolveLink = (link: string): string | null => {
      if (docMap.has(link)) return link;
      const base = link.split('/').pop()?.replace(/\.md$/, '') ?? '';
      return base && docMap.has(base) ? base : null;
    };
    const links: Link[] = [];
    docs.forEach(d => {
      d.links.forEach(link => {
        const target = resolveLink(link);
        if (target) links.push({ source: d.filename.replace(".md", ""), target });
      });
    });
    return { nodes, links };
  }, [docs]);

  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    svg.selectAll("*").remove();
    const el = svgRef.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;

    const TYPE_COLORS: Record<string, string> = {
      task: theme.accent,
      knowledge: "#4ac8f0",
      inbox: theme.warning,
      reminder: "#f04878",
      project: "#c84af0",
    };

    const sim = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id(d => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(20));

    const g = svg.append("g");

    svg.call(
      d3.zoom<SVGSVGElement, unknown>().on("zoom", e => g.attr("transform", e.transform.toString()))
    );

    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", theme.border)
      .attr("stroke-width", 1);

    const node = g.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 6)
      .attr("fill", d => TYPE_COLORS[d.type] ?? theme.textMuted)
      .attr("stroke", theme.bg)
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        const doc = docs.find(doc => doc.filename.replace(".md", "") === d.id);
        if (doc) setSelectedDoc(doc);
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .call(d3.drag<SVGCircleElement, Node>()
          .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }) as any
      );

    const label = g.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text(d => d.title.slice(0, 20))
      .attr("font-size", 9)
      .attr("fill", theme.textMuted)
      .attr("font-family", "monospace")
      .attr("dy", -9)
      .attr("text-anchor", "middle")
      .style("pointer-events", "none");

    sim.on("tick", () => {
      link
        .attr("x1", d => (d.source as Node).x ?? 0)
        .attr("y1", d => (d.source as Node).y ?? 0)
        .attr("x2", d => (d.target as Node).x ?? 0)
        .attr("y2", d => (d.target as Node).y ?? 0);
      node.attr("cx", d => d.x ?? 0).attr("cy", d => d.y ?? 0);
      label.attr("x", d => d.x ?? 0).attr("y", d => d.y ?? 0);
    });

    return () => { sim.stop(); };
  }, [nodes, links, theme, docs, setSelectedDoc]);

  return (
    <div className="h-full flex">
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-4 py-2 text-xs border-b flex-shrink-0" style={{ borderColor: theme.border, color: theme.textDim }}>
          {nodes.length} nodes · {links.length} links · click to open · scroll to zoom · drag to pan
        </div>
        <svg ref={svgRef} className="flex-1 w-full" style={{ background: theme.bg }} />
      </div>
      {selectedDoc && (
        <div className="w-96 flex-shrink-0 border-l overflow-hidden" style={{ borderColor: theme.border }}>
          <DocViewer key={selectedDoc.path} doc={selectedDoc} theme={theme} onClose={() => setSelectedDoc(null)} onOpenUrl={onOpenUrl} />
        </div>
      )}
    </div>
  );
}
