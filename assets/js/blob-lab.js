const CHANGES = {
  b1: { changeId: "zzzzzz", gitId: "6f29a1c", title: "Initial import" },
  b2: { changeId: "nkmkly", gitId: "31b87ad", title: "Add object cache" },
  b3: { changeId: "rkvvnz", gitId: "d408be2", title: "Improve cache reuse" },
};

const INITIAL_POINTERS = { main: "b3", feature: "b2" };

const MODES = {
  mononoke: {
    pointerName: "bookmark",
    pointerWriteName: "bookmark writes",
    objectCountName: "immutable blobs",
    objectStoreTitle: "immutable blobstore",
    metadataTitle: "mutable metadata",
    indexLabel: "commit graph",
    indexValue: "3 nodes",
    objects: [
      ["bonsai.b3", "parent b2, tree content.c3"],
      ["bonsai.b2", "parent b1, tree content.c2"],
      ["bonsai.b1", "root, tree content.c1"],
      ["content.c1…c3", "file bytes"],
    ],
    initialTrace: [
      "blobstore: 3 Bonsai changesets already stored",
      "metadata: main -> b3, feature -> b2",
    ],
    command(name, target) {
      return `jj bookmark set ${name} -r ${CHANGES[target].changeId}`;
    },
    changedTrace(name, previous, target) {
      return [
        this.command(name, target),
        "blobstore: no write (Bonsai objects are immutable)",
        `metadata: ${name} ${previous} -> ${target}`,
      ];
    },
  },
  git: {
    pointerName: "branch",
    pointerWriteName: "ref writes",
    objectCountName: "immutable objects",
    objectStoreTitle: "object database (.git/objects)",
    metadataTitle: "mutable refs + reflog",
    indexLabel: "reflog entries",
    indexValue: "0 new",
    objects: [
      ["commit d408be2", "parent 31b87ad, tree a9d2f61"],
      ["commit 31b87ad", "parent 6f29a1c, tree b7309af"],
      ["commit 6f29a1c", "root, tree c520dde"],
      ["tree + blob objects", "snapshots and file bytes"],
    ],
    initialTrace: [
      "objects: commits, trees, and blobs already stored",
      "refs: main -> d408be2, feature -> 31b87ad",
    ],
    command(name, target) {
      return `git branch -f ${name} ${CHANGES[target].gitId}`;
    },
    changedTrace(name, previous, target) {
      return [
        this.command(name, target),
        "objects: no write (objects are immutable)",
        `refs/heads/${name}: ${CHANGES[previous].gitId} -> ${CHANGES[target].gitId}`,
        `reflog: append ${name} branch reset`,
      ];
    },
  },
};

export function createBlobLabModel() {
  let pointers;
  let pointerWrites;

  function reset() {
    pointers = { ...INITIAL_POINTERS };
    pointerWrites = 0;
  }

  function state() {
    return { pointers: { ...pointers }, pointerWrites };
  }

  function movePointer(name, target) {
    if (!(name in pointers) || !(target in CHANGES)) return null;
    const previous = pointers[name];
    if (previous !== target) {
      pointers[name] = target;
      pointerWrites += 1;
    }
    return { name, previous, target, changed: previous !== target, state: state() };
  }

  reset();
  return { state, movePointer, reset: () => (reset(), state()) };
}

export function mountBlobLabs(root = document) {
  for (const lab of root.querySelectorAll("[data-blob-lab]")) {
    const models = {
      mononoke: createBlobLabModel(),
      git: createBlobLabModel(),
    };
    let modeName = "mononoke";
    let selectedPointer = null;
    let draggedPointer = null;

    const graph = lab.querySelector("[data-lab-graph]");
    const instruction = lab.querySelector("[data-lab-instruction]");
    const objectStoreTitle = lab.querySelector("[data-object-store-title]");
    const objectStore = lab.querySelector("[data-object-store]");
    const metadataTitle = lab.querySelector("[data-metadata-title]");
    const indexLabel = lab.querySelector("[data-index-label]");
    const indexValue = lab.querySelector("[data-index-value]");
    const objectCountLabel = lab.querySelector("[data-object-count-label]");
    const pointerWritesLabel = lab.querySelector("[data-pointer-writes-label]");
    const trace = lab.querySelector("[data-blob-trace]");
    const writes = lab.querySelector("[data-bookmark-writes]");
    const status = lab.querySelector("[data-blob-status]");
    const reset = lab.querySelector("[data-lab-reset]");

    const mode = () => MODES[modeName];
    const model = () => models[modeName];

    function setTrace(entries) {
      trace.replaceChildren(
        ...entries.map((entry) => {
          const item = document.createElement("li");
          item.textContent = entry;
          return item;
        })
      );
    }

    function render(state = model().state(), changedPointer = null) {
      const currentMode = mode();
      for (const [name, target] of Object.entries(state.pointers)) {
        const chip = lab.querySelector(`[data-bookmark="${name}"]`);
        const slot = lab.querySelector(`[data-bookmark-slot="${target}"]`);
        slot.append(chip);
        chip.setAttribute("aria-pressed", String(selectedPointer === name));
      }

      for (const value of lab.querySelectorAll("[data-bookmark-value]")) {
        const name = value.dataset.bookmarkValue;
        const target = state.pointers[name];
        value.textContent = modeName === "git" ? CHANGES[target].gitId : target;
      }

      for (const label of lab.querySelectorAll("[data-pointer-label]")) {
        label.textContent = `${currentMode.pointerName} ${label.dataset.pointerLabel}`;
      }
      for (const row of lab.querySelectorAll("[data-metadata-row]")) {
        row.classList.toggle("is-updated", row.dataset.metadataRow === changedPointer);
      }
      for (const tab of lab.querySelectorAll("[data-storage-mode]")) {
        tab.setAttribute("aria-selected", String(tab.dataset.storageMode === modeName));
      }

      objectStoreTitle.textContent = currentMode.objectStoreTitle;
      metadataTitle.textContent = currentMode.metadataTitle;
      objectCountLabel.textContent = currentMode.objectCountName;
      pointerWritesLabel.textContent = currentMode.pointerWriteName;
      indexLabel.textContent = currentMode.indexLabel;
      indexValue.textContent = modeName === "git" && state.pointerWrites
        ? `${state.pointerWrites} new`
        : currentMode.indexValue;
      objectStore.replaceChildren(
        ...currentMode.objects.map(([id, detail]) => {
          const item = document.createElement("li");
          const name = document.createElement("span");
          name.textContent = id;
          item.append(name, ` ${detail}`);
          return item;
        })
      );
      writes.textContent = String(state.pointerWrites);
      graph.classList.toggle("is-selecting", Boolean(selectedPointer));
      instruction.textContent = selectedPointer
        ? `Now choose a change for ${selectedPointer}.`
        : `Drag a ${currentMode.pointerName} onto another change. On touch or keyboard, select it, then select a change.`;
    }

    function selectPointer(name) {
      selectedPointer = selectedPointer === name ? null : name;
      render();
      status.textContent = selectedPointer
        ? `${selectedPointer} selected. Choose any change to move it.`
        : "Selection cleared.";
    }

    function move(name, target) {
      const result = model().movePointer(name, target);
      if (!result) return;
      selectedPointer = null;
      render(result.state, result.changed ? name : null);

      if (result.changed) {
        setTrace(mode().changedTrace(name, result.previous, target));
        status.textContent =
          `Moved ${name} to ${modeName === "git" ? CHANGES[target].gitId : CHANGES[target].changeId}. ` +
          `Only mutable ${mode().pointerName} data changed.`;
      } else {
        setTrace([
          mode().command(name, target),
          `${mode().pointerName}: no-op; already points here`,
        ]);
        status.textContent = `${name} already points to this change.`;
      }
    }

    for (const tab of lab.querySelectorAll("[data-storage-mode]")) {
      tab.addEventListener("click", () => {
        modeName = tab.dataset.storageMode;
        selectedPointer = null;
        render();
        setTrace(mode().initialTrace);
        status.textContent = `Showing the ${tab.textContent.trim()} storage model.`;
      });
    }

    for (const chip of lab.querySelectorAll("[data-bookmark]")) {
      chip.addEventListener("click", () => selectPointer(chip.dataset.bookmark));
      chip.addEventListener("dragstart", (event) => {
        draggedPointer = chip.dataset.bookmark;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedPointer);
        chip.classList.add("is-dragging");
      });
      chip.addEventListener("dragend", () => {
        draggedPointer = null;
        chip.classList.remove("is-dragging");
        for (const change of graph.querySelectorAll(".is-drop-target")) {
          change.classList.remove("is-drop-target");
        }
      });
    }

    for (const target of lab.querySelectorAll("[data-change-target]")) {
      const change = target.closest("[data-change]");
      target.addEventListener("click", () => {
        if (selectedPointer) move(selectedPointer, target.dataset.changeTarget);
      });
      change.addEventListener("dragover", (event) => {
        if (!draggedPointer) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        change.classList.add("is-drop-target");
      });
      change.addEventListener("dragleave", (event) => {
        if (!change.contains(event.relatedTarget)) change.classList.remove("is-drop-target");
      });
      change.addEventListener("drop", (event) => {
        event.preventDefault();
        change.classList.remove("is-drop-target");
        const name = event.dataTransfer.getData("text/plain") || draggedPointer;
        move(name, change.dataset.change);
      });
    }

    reset.addEventListener("click", () => {
      selectedPointer = null;
      render(model().reset());
      setTrace(mode().initialTrace);
      status.textContent = `Reset the ${mode().pointerName}s in this tab.`;
    });

    reset.hidden = false;
    status.hidden = false;
    render();
  }
}
