import { defaultMemoryCoordinator } from "../lib/memory/memoryCoordinator.ts";

const ashishSearch = defaultMemoryCoordinator.search({ query: "Ashish", limit: 4 });
console.log("Search 'Ashish' count:", ashishSearch.length);
ashishSearch.forEach(r => console.log(`- [Score: ${r.score.toFixed(2)}] [${r.record.memoryType}] ${r.record.key}: ${r.record.content}`));

const pySearch = defaultMemoryCoordinator.search({ query: "Python programming", limit: 4 });
console.log("Search 'Python programming' count:", pySearch.length);
pySearch.forEach(r => console.log(`- [Score: ${r.score.toFixed(2)}] [${r.record.memoryType}] ${r.record.key}: ${r.record.content}`));
