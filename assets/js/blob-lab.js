const INITIAL_OBJECTS = [
  {
    id: "bonsai.b1",
    kind: "changeset",
    parent: null,
    detail: "initial changeset, src/app.js: content.c1",
  },
  { id: "content.c1", kind: "content", detail: "src/app.js bytes" },
];

const MESSAGES = ["speed up parser", "add retry budget", "tighten cache key"];

const copyObjects = (objects) => objects.map((object) => ({ ...object }));

export function createBlobLabModel() {
  let objects;
  let at;
  let bookmark;
  let graphNodes;
  let sequence;
  let messageIndex;
  let metadataWrites;
  let lastCommand;
  let trace;

  function reset() {
    objects = copyObjects(INITIAL_OBJECTS);
    at = "b1";
    bookmark = "b1";
    graphNodes = 1;
    sequence = 1;
    messageIndex = 0;
    metadataWrites = 0;
    lastCommand = "jj log -r '::main'";
    trace = ["metadata: main -> b1", "blobstore: get bonsai.b1"];
  }

  function state() {
    return {
      objects: copyObjects(objects),
      at,
      bookmark,
      graphNodes,
      metadataWrites,
      lastCommand,
      trace: [...trace],
    };
  }

  function putChangeset({ parent, message, rewrittenFrom }) {
    sequence += 1;
    const id = `b${sequence}`;
    const parentLabel = parent ?? "root";
    const detail = rewrittenFrom
      ? `rewrite of ${rewrittenFrom}, parent ${parentLabel}, message: ${message}`
      : `parent ${parentLabel}, empty file-change list`;

    objects.unshift({ id: `bonsai.${id}`, kind: "changeset", parent, detail });
    at = id;
    graphNodes += 1;
    metadataWrites += 1;
    return id;
  }

  function newChange() {
    const parent = at;
    const id = putChangeset({ parent });
    lastCommand = "jj new";
    trace = [
      `blobstore: put bonsai.${id} (immutable)`,
      `metadata: index ${id} -> parent ${parent}`,
      `client: @ -> ${id}`,
    ];
    return { id, state: state() };
  }

  function describe() {
    const rewrittenFrom = at;
    const current = objects.find(({ id }) => id === `bonsai.${rewrittenFrom}`);
    const parent = current?.parent ?? null;
    const message = MESSAGES[messageIndex % MESSAGES.length];
    messageIndex += 1;
    const id = putChangeset({ parent, message, rewrittenFrom });
    lastCommand = `jj describe -m "${message}"`;
    trace = [
      `blobstore: put bonsai.${id} (new content hash)`,
      `blobstore: retain bonsai.${rewrittenFrom}`,
      `metadata: index ${id} -> parent ${parent ?? "root"}`,
      `client: @ ${rewrittenFrom} -> ${id}`,
    ];
    return { id, message, rewrittenFrom, state: state() };
  }

  function setBookmark() {
    const previous = bookmark;
    bookmark = at;
    metadataWrites += 1;
    lastCommand = "jj bookmark set main -r @";
    trace = ["blobstore: no write", `metadata: main ${previous} -> ${bookmark}`];
    return { previous, bookmark, state: state() };
  }

  function showFile() {
    const derivedId = `fsnode.${bookmark}`;
    const alreadyDerived = objects.some(({ id }) => id === derivedId);

    if (!alreadyDerived) {
      objects.push({
        id: derivedId,
        kind: "derived",
        detail: `manifest for ${bookmark}, src/app.js: content.c1`,
      });
    }

    lastCommand = "jj file show main:src/app.js";
    trace = [
      `metadata: main -> ${bookmark}`,
      `blobstore: get bonsai.${bookmark}`,
      alreadyDerived
        ? `blobstore: get ${derivedId}`
        : `derive: fsnode manifest -> put ${derivedId}`,
      "blobstore: get content.c1",
    ];
    return { derived: !alreadyDerived, state: state() };
  }

  reset();
  return {
    state,
    newChange,
    describe,
    setBookmark,
    showFile,
    reset: () => (reset(), state()),
  };
}

export function mountBlobLabs(root = document) {
  for (const lab of root.querySelectorAll("[data-blob-lab]")) {
    const model = createBlobLabModel();
    const command = lab.querySelector("[data-blob-command]");
    const objectList = lab.querySelector("[data-blob-objects]");
    const at = lab.querySelector("[data-blob-at]");
    const bookmark = lab.querySelector("[data-blob-bookmark]");
    const graph = lab.querySelector("[data-blob-graph]");
    const trace = lab.querySelector("[data-blob-trace]");
    const count = lab.querySelector("[data-blob-count]");
    const changesets = lab.querySelector("[data-blob-changesets]");
    const derived = lab.querySelector("[data-blob-derived]");
    const metadataWrites = lab.querySelector("[data-blob-metadata-writes]");
    const status = lab.querySelector("[data-blob-status]");
    const controls = lab.querySelector(".blob-lab__controls");

    function render(state = model.state()) {
      command.textContent = state.lastCommand;
      objectList.replaceChildren(
        ...state.objects.map(({ id, kind, detail }) => {
          const item = document.createElement("li");
          const name = document.createElement("span");
          name.textContent = id;
          item.append(name, ` ${detail}`);
          item.dataset.kind = kind;
          return item;
        })
      );
      at.textContent = state.at;
      bookmark.textContent = state.bookmark;
      graph.textContent = `${state.graphNodes} ${state.graphNodes === 1 ? "node" : "nodes"}`;
      trace.replaceChildren(
        ...state.trace.map((entry) => {
          const item = document.createElement("li");
          item.textContent = entry;
          return item;
        })
      );
      count.textContent = String(state.objects.length);
      changesets.textContent = String(
        state.objects.filter(({ kind }) => kind === "changeset").length
      );
      derived.textContent = String(
        state.objects.filter(({ kind }) => kind === "derived").length
      );
      metadataWrites.textContent = String(state.metadataWrites);
    }

    lab.querySelector("[data-blob-new]").addEventListener("click", () => {
      const result = model.newChange();
      render(result.state);
      status.textContent = `Stored bonsai.${result.id}; mutable client @ now points to it.`;
    });

    lab.querySelector("[data-blob-describe]").addEventListener("click", () => {
      const result = model.describe();
      render(result.state);
      status.textContent =
        `Rewrote ${result.rewrittenFrom} as ${result.id}. The old immutable object remains.`;
    });

    lab.querySelector("[data-blob-bookmark-set]").addEventListener("click", () => {
      const result = model.setBookmark();
      render(result.state);
      status.textContent =
        result.previous === result.bookmark
          ? `main already points to ${result.bookmark}; only mutable metadata was checked.`
          : `Moved main from ${result.previous} to ${result.bookmark} without writing a blob.`;
    });

    lab.querySelector("[data-blob-file-show]").addEventListener("click", () => {
      const result = model.showFile();
      render(result.state);
      status.textContent = result.derived
        ? "Derived an fsnode manifest, then resolved src/app.js to content.c1."
        : "Reused the derived fsnode manifest and read content.c1.";
    });

    lab.querySelector("[data-blob-reset]").addEventListener("click", () => {
      render(model.reset());
      status.textContent = "Reset the educational repository model.";
    });

    render();
    controls.hidden = false;
    status.hidden = false;
  }
}
