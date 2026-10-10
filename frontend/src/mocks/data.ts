import type {
  AuthSession,
  CreditBalance,
  Diagram,
  Note,
  NoteSummary,
  Question,
  Transaction,
  User,
} from "@/types";

// ─── Users ────────────────────────────────────────────────────────────────────
export const MOCK_USER: User = {
  id: "user_01",
  email: "akshat.dubey@studyforge.ai",
  name: "Akshat Dubey",
  avatar_url: "https://api.dicebear.com/8.x/avataaars/svg?seed=akshatdubey",
  created_at: "2025-09-01T08:00:00Z",
};

export const MOCK_SESSION: AuthSession = {
  user: MOCK_USER,
};


// ─── Credits ──────────────────────────────────────────────────────────────────
export const MOCK_CREDIT_BALANCE: CreditBalance = {
  balance: 42,
  lifetime_used: 158,
};

// ─── Diagrams ─────────────────────────────────────────────────────────────────
const MOCK_MERMAID_DIAGRAM: Diagram = {
  id: "diag_01",
  type: "mermaid",
  title: "Memory Hierarchy",
  data: `graph TD
    CPU["CPU Registers"] --> L1["L1 Cache (32 KB)"]
    L1 --> L2["L2 Cache (256 KB)"]
    L2 --> L3["L3 Cache (6 MB)"]
    L3 --> RAM["Main Memory (DDR5)"]
    RAM --> SSD["NVMe SSD"]
    SSD --> HDD["HDD / Network Storage"]`,
};

const MOCK_BAR_DIAGRAM: Diagram = {
  id: "diag_02",
  type: "recharts_bar",
  title: "Access Latency by Level (ns)",
  data: {
    keys: ["latency_ns"],
    values: [
      { name: "Registers", latency_ns: 0.3 },
      { name: "L1 Cache", latency_ns: 1 },
      { name: "L2 Cache", latency_ns: 4 },
      { name: "L3 Cache", latency_ns: 12 },
      { name: "RAM", latency_ns: 70 },
      { name: "NVMe SSD", latency_ns: 20000 },
    ],
  },
};

const MOCK_PIE_DIAGRAM: Diagram = {
  id: "diag_03",
  type: "recharts_pie",
  title: "Cache Miss Rate Distribution",
  data: {
    keys: ["value"],
    values: [
      { name: "L1 Hits", value: 72 },
      { name: "L2 Hits", value: 18 },
      { name: "L3 Hits", value: 7 },
      { name: "RAM Hits", value: 3 },
    ],
  },
};

// ─── Questions ────────────────────────────────────────────────────────────────
const MOCK_QUESTIONS: Question[] = [
  {
    id: "q_01",
    question: "What is the primary purpose of CPU cache memory?",
    answer:
      "CPU cache reduces the average time to access data from main memory by storing frequently used data closer to the processor. This bridges the speed gap between fast CPU registers and slower RAM.",
    priority: "high",
    tags: ["cache", "cpu", "performance"],
  },
  {
    id: "q_02",
    question: "Explain the difference between L1, L2, and L3 cache.",
    answer:
      "L1 is the smallest and fastest (32 KB, ~1 ns), private per core. L2 is larger (256 KB, ~4 ns), also per core. L3 is shared across all cores, much larger (6 MB+, ~12 ns) but slower. Each level acts as a fallback when the previous level misses.",
    priority: "high",
    tags: ["cache-levels", "cpu", "architecture"],
  },
  {
    id: "q_03",
    question: "What is cache coherence and why does it matter?",
    answer:
      "Cache coherence ensures that multiple caches holding copies of the same memory location have a consistent view. Without it, multicore systems could operate on stale data. Protocols like MESI maintain coherence.",
    priority: "medium",
    tags: ["multicore", "coherence", "MESI"],
  },
  {
    id: "q_04",
    question: "What is the principle of spatial vs temporal locality?",
    answer:
      "Temporal locality: recently accessed data is likely to be accessed again soon. Spatial locality: data near recently accessed addresses is likely to be accessed. Caches exploit both principles to prefetch and retain relevant data.",
    priority: "medium",
    tags: ["locality", "cache", "prefetch"],
  },
  {
    id: "q_05",
    question: "How does write-back differ from write-through caching?",
    answer:
      "Write-through writes data to both cache and main memory immediately, simpler but slower. Write-back only writes to cache and marks the line dirty; main memory is updated later when the line is evicted—faster but more complex.",
    priority: "low",
    tags: ["write-policy", "cache"],
  },
];

// ─── Notes ────────────────────────────────────────────────────────────────────
export const MOCK_NOTE_CONTENT = `
## Computer Architecture: Memory Hierarchy

Modern computer systems arrange memory into a **hierarchy** based on speed and cost.
Fast memory is expensive and physically close to the CPU; slower memory is cheaper
and further away.

### Key Concepts

- **Registers** – Fastest, inside the CPU core, ~0.3 ns access.
- **L1/L2/L3 Cache** – SRAM-based, progressively larger and slower.
- **Main Memory (DRAM)** – Gigabytes in capacity, ~70 ns latency.
- **Persistent Storage** – SSDs / HDDs, microseconds to milliseconds.

### Cache Operation

When the CPU requests data, it checks each cache level in order. A **cache hit**
returns data immediately; a **cache miss** promotes data from the next level.

\`\`\`
Cache Miss Rate = Cache Misses / Total Accesses × 100%
\`\`\`

### Eviction Policies

| Policy | Description |
|--------|-------------|
| LRU | Evict Least Recently Used line |
| FIFO | Evict oldest loaded line |
| Random | Evict a randomly selected line |
| LFU | Evict Least Frequently Used line |

### Why It Matters

Efficient use of the memory hierarchy can yield **10× to 100×** performance
improvements by reducing cache misses and avoiding expensive main-memory accesses.
`;

export const MOCK_NOTE: Note = {
  id: "note_01",
  job_id: "job_01",
  user_id: "user_01",
  topic: "Computer Architecture: Memory Hierarchy",
  difficulty: "medium",
  status: "complete",
  content: MOCK_NOTE_CONTENT,
  diagrams: [MOCK_MERMAID_DIAGRAM, MOCK_BAR_DIAGRAM, MOCK_PIE_DIAGRAM],
  questions: MOCK_QUESTIONS,
  created_at: "2026-09-26T10:00:00Z",
  updated_at: "2026-09-26T10:01:30Z",
};

export const MOCK_NOTE_2: Note = {
  id: "note_02",
  job_id: "job_02",
  user_id: "user_01",
  topic: "Operating Systems: Process Scheduling",
  difficulty: "hard",
  status: "complete",
  content: `## Process Scheduling\n\nProcess scheduling determines which process runs on the CPU at any given time.\n\n### Scheduling Algorithms\n- **FCFS** – First Come First Served\n- **SJF** – Shortest Job First\n- **Round Robin** – Time-slice based\n- **Priority Scheduling** – Higher priority runs first\n\n### Key Metrics\n- **Throughput**: processes completed per unit time\n- **Turnaround Time**: total time from submission to completion\n- **Response Time**: time until first response\n- **Waiting Time**: total time spent in ready queue`,
  diagrams: [
    {
      id: "diag_04",
      type: "mermaid",
      title: "Process State Diagram",
      data: `stateDiagram-v2\n    [*] --> New\n    New --> Ready: admitted\n    Ready --> Running: scheduled\n    Running --> Ready: preempted\n    Running --> Waiting: I/O request\n    Waiting --> Ready: I/O complete\n    Running --> Terminated: exit\n    Terminated --> [*]`,
    },
  ],
  questions: [
    {
      id: "q_06",
      question: "What is starvation in process scheduling?",
      answer: "Starvation occurs when a low-priority process is indefinitely postponed because higher-priority processes keep arriving. Aging (gradually increasing priority of waiting processes) is the common solution.",
      priority: "high",
      tags: ["starvation", "priority", "aging"],
    },
    {
      id: "q_07",
      question: "What is the key advantage of Round Robin scheduling?",
      answer: "Round Robin provides fair CPU time distribution and good response times for interactive systems. Each process gets a fixed time quantum, preventing any single process from monopolizing the CPU.",
      priority: "high",
      tags: ["round-robin", "fairness", "interactive"],
    },
  ],
  created_at: "2026-09-25T14:00:00Z",
  updated_at: "2026-09-25T14:02:00Z",
};

export const MOCK_NOTE_3: Note = {
  id: "note_03",
  job_id: "job_03",
  user_id: "user_01",
  topic: "Data Structures: Binary Search Trees",
  difficulty: "easy",
  status: "complete",
  content: `## Binary Search Trees\n\nA **Binary Search Tree (BST)** is a node-based binary tree data structure where each node's left subtree contains only values less than the node, and the right subtree only greater values.\n\n### Operations\n- **Search**: O(h) where h is the height\n- **Insert**: O(h)\n- **Delete**: O(h)\n\nFor a balanced BST, h = O(log n).`,
  diagrams: [],
  questions: [
    {
      id: "q_08",
      question: "What is the worst-case time complexity of BST search?",
      answer: "O(n) — when the tree is completely unbalanced (e.g., inserting sorted data creates a linked-list-like structure). A balanced BST guarantees O(log n).",
      priority: "high",
      tags: ["bst", "complexity", "worst-case"],
    },
  ],
  created_at: "2026-09-24T09:00:00Z",
  updated_at: "2026-09-24T09:01:00Z",
};

export const MOCK_NOTES_DB: Record<string, Note> = {
  note_01: MOCK_NOTE,
  note_02: MOCK_NOTE_2,
  note_03: MOCK_NOTE_3,
};

export const MOCK_NOTE_SUMMARIES: NoteSummary[] = [
  { id: "note_01", topic: "Computer Architecture: Memory Hierarchy", difficulty: "medium", status: "complete", created_at: "2026-09-26T10:00:00Z" },
  { id: "note_02", topic: "Operating Systems: Process Scheduling", difficulty: "hard", status: "complete", created_at: "2026-09-25T14:00:00Z" },
  { id: "note_03", topic: "Data Structures: Binary Search Trees", difficulty: "easy", status: "complete", created_at: "2026-09-24T09:00:00Z" },
];

// ─── Transactions ─────────────────────────────────────────────────────────────
export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: "tx_01", amount: 50, paid_amount: 39900, currency: "inr", description: "Starter pack — 50 credits", created_at: "2026-09-20T10:00:00Z" },
  { id: "tx_02", amount: -2, description: "Generated: Memory Hierarchy", created_at: "2026-09-26T10:00:00Z" },
  { id: "tx_03", amount: -2, description: "Generated: Process Scheduling", created_at: "2026-09-25T14:00:00Z" },
  { id: "tx_04", amount: -2, description: "Generated: Binary Search Trees", created_at: "2026-09-24T09:00:00Z" },
  { id: "tx_05", amount: 150, paid_amount: 99900, currency: "inr", description: "Pro pack — 150 credits", created_at: "2026-09-10T08:30:00Z" },
];
