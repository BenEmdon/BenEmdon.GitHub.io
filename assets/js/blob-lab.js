const INITIAL_OBJECTS = [
  { id: "delta-02", entries: { beta: "5" } },
  { id: "base-01", entries: { alpha: "1", beta: "2", gamma: "3" } },
];

const WRITES = [
  ["alpha", "4"],
  ["delta", "7"],
  ["beta", "8"],
];

const READS = ["beta", "gamma", "missing"];
const BYTES_PER_ENTRY = 64;

const copyObjects = (objects) =>
  objects.map(({ id, entries }) => ({ id, entries: { ...entries } }));

export function createBlobLabModel() {
  let objects;
  let manifestVersion;
  let objectSequence;
  let writeIndex;
  let readIndex;
  let bytesWritten;
  let lastRead;

  function reset() {
    objects = copyObjects(INITIAL_OBJECTS);
    manifestVersion = 2;
    objectSequence = 2;
    writeIndex = 0;
    readIndex = 0;
    bytesWritten = 0;
    lastRead = { probes: 0, trace: "read trace: not run" };
  }

  function state() {
    return {
      objects: copyObjects(objects),
      manifestVersion,
      bytesWritten,
      lastRead: { ...lastRead },
    };
  }

  function write() {
    const [key, value] = WRITES[writeIndex % WRITES.length];
    writeIndex += 1;
    objectSequence += 1;
    manifestVersion += 1;
    objects.unshift({
      id: `delta-${String(objectSequence).padStart(2, "0")}`,
      entries: { [key]: value },
    });
    bytesWritten += BYTES_PER_ENTRY;
    return { key, value, state: state() };
  }

  function read() {
    const key = READS[readIndex % READS.length];
    readIndex += 1;
    const visited = [];
    let value;

    for (const object of objects) {
      visited.push(object.id);
      if (Object.hasOwn(object.entries, key)) {
        value = object.entries[key];
        break;
      }
    }

    lastRead = {
      probes: visited.length,
      trace: `read ${key}: ${visited.join(" -> ")} -> ${value === undefined ? "not found" : value}`,
    };
    return { key, value, state: state() };
  }

  function compact() {
    if (objects.length === 1) return { compacted: false, state: state() };

    const entries = {};
    for (const object of [...objects].reverse()) Object.assign(entries, object.entries);

    objectSequence += 1;
    manifestVersion += 1;
    const count = objects.length;
    objects = [
      {
        id: `snapshot-${String(objectSequence).padStart(2, "0")}`,
        entries,
      },
    ];
    bytesWritten += Object.keys(entries).length * BYTES_PER_ENTRY;
    return { compacted: true, count, state: state() };
  }

  reset();
  return { state, write, read, compact, reset: () => (reset(), state()) };
}

const describeEntries = (entries) =>
  Object.entries(entries)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");

export function mountBlobLabs(root = document) {
  for (const lab of root.querySelectorAll("[data-blob-lab]")) {
    const model = createBlobLabModel();
    const manifest = lab.querySelector("[data-blob-manifest]");
    const objectList = lab.querySelector("[data-blob-objects]");
    const trace = lab.querySelector("[data-blob-trace]");
    const count = lab.querySelector("[data-blob-count]");
    const probes = lab.querySelector("[data-blob-probes]");
    const bytes = lab.querySelector("[data-blob-bytes]");
    const status = lab.querySelector("[data-blob-status]");
    const controls = lab.querySelector(".blob-lab__controls");

    function render(state = model.state()) {
      manifest.textContent =
        `manifest-v${state.manifestVersion} -> ` + state.objects.map(({ id }) => id).join(", ");
      objectList.replaceChildren(
        ...state.objects.map(({ id, entries }) => {
          const item = document.createElement("li");
          item.textContent = `${id} { ${describeEntries(entries)} }`;
          return item;
        })
      );
      trace.textContent = state.lastRead.trace;
      count.textContent = String(state.objects.length);
      probes.textContent = `${state.lastRead.probes} ${state.lastRead.probes === 1 ? "probe" : "probes"}`;
      bytes.textContent = `${state.bytesWritten} B`;
    }

    lab.querySelector("[data-blob-write]").addEventListener("click", () => {
      const result = model.write();
      render(result.state);
      status.textContent = `Appended ${result.key}: ${result.value} as a new immutable delta.`;
    });

    lab.querySelector("[data-blob-read]").addEventListener("click", () => {
      const result = model.read();
      render(result.state);
      status.textContent =
        result.value === undefined
          ? `${result.key} was not found after ${result.state.lastRead.probes} probes.`
          : `Found ${result.key}: ${result.value} after ${result.state.lastRead.probes} probes.`;
    });

    lab.querySelector("[data-blob-compact]").addEventListener("click", () => {
      const result = model.compact();
      render(result.state);
      status.textContent = result.compacted
        ? `Compacted ${result.count} blobs into one snapshot.`
        : "Already compacted. There is only one active blob.";
    });

    lab.querySelector("[data-blob-reset]").addEventListener("click", () => {
      render(model.reset());
      status.textContent = "Reset to the initial two-blob state.";
    });

    render();
    controls.hidden = false;
    status.hidden = false;
  }
}
