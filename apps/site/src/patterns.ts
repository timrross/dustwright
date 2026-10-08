// The patterns page: the example designs, each with links to the playground and the viewer. Design text (names,
// descriptions) goes in through textContent only.
import { parseText } from "@dustwright/core";
import { EXAMPLES } from "./examples.js";
import "./site.css";

const list = document.querySelector<HTMLUListElement>("#patterns")!;
for (const [slug, text] of EXAMPLES) {
  const model = parseText(text).model;
  if (!model) continue;
  const item = document.createElement("li");
  const title = document.createElement("h2");
  title.textContent = model.meta.name;
  const description = document.createElement("p");
  description.textContent = model.meta.description ?? "";
  const facts = document.createElement("p");
  facts.className = "status";
  facts.textContent = `${model.blocks.size} blocks, ${model.size.join(" × ")}; ${model.tests.length} test case(s).`;
  const links = document.createElement("p");
  const play = document.createElement("a");
  play.href = `/play/?example=${encodeURIComponent(slug)}`;
  play.textContent = "Open in the playground";
  const view = document.createElement("a");
  view.href = `/view/?src=${encodeURIComponent(`/examples/${slug}.rsd.json`)}`;
  view.textContent = "View";
  links.append(play, " · ", view);
  item.append(title, description, facts, links);
  list.appendChild(item);
}
