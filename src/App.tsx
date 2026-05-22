import { useState, useEffect, useRef, type ChangeEvent, type CSSProperties } from "react";
import PSD from "@webtoon/psd";
import "./App.css";

type Layer = {
  id: string;
  src: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width?: number;
  height?: number;
  rotation: number;
  scale: number;
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type ViewMode = "choose" | "test" | "import";

const initialLayers: Layer[] = [
  { id: "irisL", src: "/test-avatar/irisL.png", x: 0, y: 0, offsetX: 0, offsetY: 0, rotation: 0, scale: 1 },
  { id: "irisR", src: "/test-avatar/irisR.png", x: 0, y: 0, offsetX: 0, offsetY: 0, rotation: 0, scale: 1 },
  { id: "eyeL", src: "/test-avatar/eyeL.png", x: 0, y: 0, offsetX: 0, offsetY: 0, rotation: 0, scale: 1 },
  { id: "eyeR", src: "/test-avatar/eyeR.png", x: 0, y: 0, offsetX: 0, offsetY: 0, rotation: 0, scale: 1 },
  { id: "mouth", src: "/test-avatar/mouth.png", x: 0, y: 0, offsetX: 0, offsetY: 0, rotation: 0, scale: 1 },
  { id: "head", src: "/test-avatar/head.png", x: 0, y: 0, offsetX: 0, offsetY: 0, rotation: 0, scale: 1 },
  { id: "neck", src: "/test-avatar/neck.png", x: 0, y: 0, offsetX: 0, offsetY: 0, rotation: 0, scale: 1 },
];

const imgStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  transformOrigin: "0 0",
  pointerEvents: "none",
  display: "block",
};

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("choose");
  const [layers, setLayers] = useState<Layer[]>(initialLayers);
  const [selectedLayerId, setSelectedLayerId] = useState<string>(initialLayers[0].id);
  const [sourceLabel, setSourceLabel] = useState("Provided test avatar");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fitTransform, setFitTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [previewElement, setPreviewElement] = useState<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? layers[0];

  const resetSelected = () => {
    setLayers((prev) =>
      prev.map((layer) =>
        layer.id === selectedLayerId
          ? { ...layer, offsetX: 0, offsetY: 0, rotation: 0, scale: 1 }
          : layer,
      ),
    );
  };

  const updateSelectedLayer = (key: keyof Omit<Layer, "id" | "src">, value: number) => {
    setLayers((prev) =>
      prev.map((layer) =>
        layer.id === selectedLayerId ? { ...layer, [key]: value } : layer,
      ),
    );
  };

  const createDataUrlFromLayer = async (layer: any) => {
    const pixels = await layer.composite(false);
    const canvas = document.createElement("canvas");
    canvas.width = layer.width;
    canvas.height = layer.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    const imageData = new ImageData(pixels, layer.width, layer.height);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  };

  const normalizePsdLayers = async (psd: any) => {
    const result: Layer[] = [];
    const bounds: Bounds = {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    };

    const walk = async (node: any) => {
      if (node.type === "Layer" && node.width > 0 && node.height > 0 && !node.isHidden) {
        const src = await createDataUrlFromLayer(node);
        const absX = typeof node.left === "number" ? node.left : 0;
        const absY = typeof node.top === "number" ? node.top : 0;
        result.push({
          id: node.name || `layer-${result.length}`,
          src,
          x: absX,
          y: absY,
          offsetX: 0,
          offsetY: 0,
          width: node.width,
          height: node.height,
          rotation: 0,
          scale: 1,
        });
        bounds.minX = Math.min(bounds.minX, absX);
        bounds.minY = Math.min(bounds.minY, absY);
        bounds.maxX = Math.max(bounds.maxX, absX + node.width);
        bounds.maxY = Math.max(bounds.maxY, absY + node.height);
      }

      if (node.children) {
        for (const child of node.children) {
          await walk(child);
        }
      }
    };

    await walk(psd);

    if (Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY)) {
      for (const item of result) {
        item.x -= bounds.minX;
        item.y -= bounds.minY;
      }
      bounds.maxX -= bounds.minX;
      bounds.maxY -= bounds.minY;
      bounds.minX = 0;
      bounds.minY = 0;
    }

    return { layers: result.reverse(), bounds };
  };

  const computeFitTransform = (bounds: Bounds, width: number, height: number) => {
    const modelWidth = bounds.maxX - bounds.minX;
    const modelHeight = bounds.maxY - bounds.minY;
    if (!Number.isFinite(modelWidth) || !Number.isFinite(modelHeight) || modelWidth <= 0 || modelHeight <= 0) {
      return { scale: 1, offsetX: 0, offsetY: 0 };
    }

    const padding = 24;
    const availableWidth = Math.max(width - padding * 2, 100);
    const availableHeight = Math.max(height - padding * 2, 100);
    const scale = Math.min(availableWidth / modelWidth, availableHeight / modelHeight);
    const offsetX = (availableWidth - modelWidth * scale) / 2 - bounds.minX * scale + padding;
    const offsetY = (availableHeight - modelHeight * scale) / 2 - bounds.minY * scale + padding;

    return { scale, offsetX, offsetY };
  };

  const computeLayerBounds = (layers: Layer[]) => {
    const bounds: Bounds = {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    };

    for (const layer of layers) {
      const width = typeof layer.width === "number" ? layer.width : 0;
      const height = typeof layer.height === "number" ? layer.height : 0;
      const x = layer.x + layer.offsetX;
      const y = layer.y + layer.offsetY;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x + width);
      bounds.maxY = Math.max(bounds.maxY, y + height);
    }

    if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return bounds;
  };

  const loadLayerDimensions = async (layers: Layer[]) => {
    const loaded = await Promise.all(
      layers.map((layer) => {
        if (typeof layer.width === "number" && typeof layer.height === "number") {
          return Promise.resolve(layer);
        }

        return new Promise<Layer>((resolve) => {
          const image = new Image();
          image.onload = () => resolve({
            ...layer,
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
          image.onerror = () => resolve({ ...layer, width: 0, height: 0 });
          image.src = layer.src;
        });
      }),
    );

    return loaded;
  };

  const handleUseTestFile = async () => {
    setStatusMessage("Loading test preview...");
    const reversedInitial = [...initialLayers].reverse();
    const loadedLayers = await loadLayerDimensions(reversedInitial);
    const bounds = computeLayerBounds(loadedLayers);
    const previewWidth = previewElement?.clientWidth || canvasSize.width || 640;
    const previewHeight = previewElement?.clientHeight || canvasSize.height || 640;
    const transform = computeFitTransform(bounds, previewWidth, previewHeight);

    setLayers(loadedLayers);
    setSelectedLayerId(loadedLayers[0].id);
    setSourceLabel("Provided test avatar");
    setStatusMessage(null);
    setFitTransform(transform);
    setViewMode("test");
  };

  const handlePsdFile = async (file: File) => {
    try {
      setStatusMessage("Parsing PSD file...");
      const raw = await file.arrayBuffer();
      const psd = PSD.parse(raw);
      const { layers: importedLayers, bounds } = await normalizePsdLayers(psd);
      if (importedLayers.length === 0) {
        setStatusMessage("No visible layers found in PSD.");
        return;
      }
      const previewWidth = previewElement?.clientWidth || canvasSize.width || 640;
      const previewHeight = previewElement?.clientHeight || canvasSize.height || 640;
      const { scale, offsetX, offsetY } = computeFitTransform(bounds, previewWidth, previewHeight);
      setFitTransform({ scale, offsetX, offsetY });
      setLayers(importedLayers);
      setSelectedLayerId(importedLayers[0].id);
      setSourceLabel(file.name);
      setStatusMessage(null);
      setViewMode("import");
    } catch (error) {
      console.error(error);
      setStatusMessage("Failed to import PSD. Please try a different file.");
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handlePsdFile(file);
    }
  };

  useEffect(() => {
    if (!previewElement) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
      }
    });

    resizeObserver.observe(previewElement);
    setCanvasSize({ width: previewElement.clientWidth, height: previewElement.clientHeight });

    return () => resizeObserver.disconnect();
  }, [previewElement]);

  useEffect(() => {
    if (viewMode === "choose" || canvasSize.width === 0 || canvasSize.height === 0 || layers.length === 0) {
      return;
    }

    let active = true;

    const initializePreview = async () => {
      const loadedLayers = await loadLayerDimensions(layers);
      if (!active) return;

      setLayers((current) => {
        const changed = loadedLayers.some((layer, index) => {
          const currentLayer = current[index];
          return (
            !currentLayer ||
            currentLayer.width !== layer.width ||
            currentLayer.height !== layer.height
          );
        });

        return changed ? loadedLayers : current;
      });

      const bounds = computeLayerBounds(loadedLayers);
      setFitTransform(computeFitTransform(bounds, canvasSize.width, canvasSize.height));
    };

    initializePreview();

    return () => {
      active = false;
    };
  }, [viewMode, canvasSize.width, canvasSize.height, layers]);

  if (viewMode === "choose") {
    return (
      <div className="entry-screen">
        <h1>Choose a source</h1>
        <p>Import a PSD file or use the built-in test avatar to start editing.</p>
        <div className="entry-buttons">
          <button type="button" onClick={handleUseTestFile}>
            Use provided test file
          </button>
          <label className="file-button">
            Import PSD file
            <input type="file" accept=".psd" onChange={handleFileChange} />
          </label>
        </div>
        {statusMessage && <p className="status-message">{statusMessage}</p>}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <section className="preview-panel">
        <div className="source-bar">
          <div>
            <strong>Source:</strong> {sourceLabel}
          </div>
          <button type="button" onClick={() => setViewMode("choose")}>Choose another source</button>
        </div>

        <h1>LiteRig PNG Studio</h1>
        <p className="subtitle">Move, rotate, and scale your PNG layers with sliders.</p>
        <div className="preview-frame">
          <div
            className="preview-canvas"
            ref={(node) => {
              previewRef.current = node;
              setPreviewElement(node);
            }}
          >
            {layers.map((layer) => {
              const style: CSSProperties = {
                ...imgStyle,
                left: `${(layer.x + layer.offsetX) * fitTransform.scale + fitTransform.offsetX}px`,
                top: `${(layer.y + layer.offsetY) * fitTransform.scale + fitTransform.offsetY}px`,
                transform: `rotate(${layer.rotation}deg) scale(${layer.scale})`,
              };

              if (typeof layer.width === "number" && typeof layer.height === "number") {
                style.width = `${layer.width * fitTransform.scale}px`;
                style.height = `${layer.height * fitTransform.scale}px`;
              }

              return (
                <img
                  key={layer.id}
                  src={layer.src}
                  alt={layer.id}
                  style={style}
                />
              );
            })}
          </div>
        </div>
      </section>

      <aside className="controls-panel">
        <div className="control-section">
          <h3>{selectedLayer.id} controls</h3>
          <div className="control-row">
            <label htmlFor="x-range">X offset: {selectedLayer.offsetX}px</label>
            <input
              id="x-range"
              type="range"
              min="-300"
              max="300"
              value={selectedLayer.offsetX}
              onChange={(event) => updateSelectedLayer("offsetX", Number(event.target.value))}
            />
          </div>
          <div className="control-row">
            <label htmlFor="y-range">Y offset: {selectedLayer.offsetY}px</label>
            <input
              id="y-range"
              type="range"
              min="-300"
              max="300"
              value={selectedLayer.offsetY}
              onChange={(event) => updateSelectedLayer("offsetY", Number(event.target.value))}
            />
          </div>
          <div className="control-row">
            <label htmlFor="rotation-range">Rotation: {selectedLayer.rotation}°</label>
            <input
              id="rotation-range"
              type="range"
              min="-180"
              max="180"
              value={selectedLayer.rotation}
              onChange={(event) => updateSelectedLayer("rotation", Number(event.target.value))}
            />
          </div>
          <div className="control-row">
            <label htmlFor="scale-range">Scale: {selectedLayer.scale.toFixed(2)}</label>
            <input
              id="scale-range"
              type="range"
              min="0.1"
              max="2"
              step="0.01"
              value={selectedLayer.scale}
              onChange={(event) => updateSelectedLayer("scale", Number(event.target.value))}
            />
          </div>
        </div>

        <button type="button" className="reset-button" onClick={resetSelected}>
          Reset layer
        </button>

        <div className="control-section">
          <h2>Selected layer</h2>
          <div className="layer-buttons">
            {layers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                className={layer.id === selectedLayerId ? "active" : ""}
                onClick={() => setSelectedLayerId(layer.id)}
              >
                {layer.id}
              </button>
            ))}
          </div>
        </div>

        
      </aside>
    </div>
  );
}

export default App;
