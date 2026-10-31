
import { useEffect, useRef, useState } from "react";
import {
  deleteTimestamp,
  getTimestamps,
  saveTimestamp,
  updateTimestamp,
} from "./lib/timestamp";

type TimeRange = {
  start: number;
  end: number;
};

type Segment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStart = useRef<number | null>(null);
  const dragMode = useRef<"select" | "move" | null>(null);
  const rangeAtDragStart = useRef<TimeRange | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [peaks, setPeaks] = useState<number[]>([]);
  
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedRange, setSelectedRange] =
    useState<TimeRange | null>(null);

  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [updatingSegmentId, setUpdatingSegmentId] = useState<number | null>(null);
  const [deletingSegmentId, setDeletingSegmentId] = useState<number | null>(null);
  const [isLoadingSegments, setIsLoadingSegments] = useState(true);

  const [text,setText] = useState("");
  const [segments,setSegments] = useState<Segment[]>([]);

  useEffect(() => {
    async function loadSegments() {
      try {
        setSegments(await getTimestamps());
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? `Could not load timestamps: ${loadError.message}`
            : "Could not load timestamps. Please refresh and try again.",
        );
      } finally {
        setIsLoadingSegments(false);
      }
    }

    loadSegments();
  }, []);

  async function handleAddSegment() {
    if (!selectedRange || !text.trim()) return;

    setIsSaving(true);
    setError("");

    try {
      const savedTimestamp = await saveTimestamp(
        selectedRange.start,
        selectedRange.end,
        text.trim(),
      );

      setSegments((existingSegments) => [...existingSegments, savedTimestamp]);
      setText("");
      setSelectedRange(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? `Could not save timestamp: ${saveError.message}`
          : "Could not save timestamp. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancelRange() {
    setSelectedRange(null);
    setText("");
  }

  function updateSegmentTime(
    id: number,
    field: "start" | "end",
    value: number
  ) {
    if (!Number.isFinite(value)) return;

    const time = Math.max(0, Math.min(value, duration));

    setSegments((existingSegments) =>
      existingSegments.map((segment) => {
        if (segment.id !== id) return segment;

        if (field === "start") {
          return {
            ...segment,
            start: Math.min(time, segment.end),
          };
        }

        return {
          ...segment,
          end: Math.max(time, segment.start),
        };
      })
    );
  }

  async function handleUpdateSegment(id: number) {
    const segment = segments.find((savedSegment) => savedSegment.id === id);
    if (!segment) return;

    setUpdatingSegmentId(id);
    setError("");

    try {
      const updatedTimestamp = await updateTimestamp(
        segment.id,
        segment.start,
        segment.end,
      );

      setSegments((existingSegments) =>
        existingSegments.map((savedSegment) =>
          savedSegment.id === id ? updatedTimestamp : savedSegment,
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? `Could not update timestamp: ${updateError.message}`
          : "Could not update timestamp. Please try again.",
      );
    } finally {
      setUpdatingSegmentId(null);
    }
  }

  async function handleDeleteSegment(id: number) {
    if (!window.confirm("Delete this saved text segment?")) return;

    setDeletingSegmentId(id);
    setError("");

    try {
      await deleteTimestamp(id);
      setSegments((existingSegments) =>
        existingSegments.filter((segment) => segment.id !== id),
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? `Could not delete timestamp: ${deleteError.message}`
          : "Could not delete timestamp. Please try again.",
      );
    } finally {
      setDeletingSegmentId(null);
    }
  }

  const currentSegment = segments.find(
    (segment) =>
      currentTime >= segment.start && currentTime <= segment.end
  ) ?? (
    selectedRange &&
    text.trim() &&
    currentTime >= selectedRange.start &&
    currentTime <= selectedRange.end
      ? { ...selectedRange, text: text.trim() }
      : undefined
  );

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];

    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("video/")) {
      setError("Please select a valid video.");
      return;
    }

    setError("");

    setFile(selectedFile);
    setVideoUrl(URL.createObjectURL(selectedFile));

    setPeaks([]);
    setDuration(0);
    setCurrentTime(0);
    setSelectedRange(null);
    setText("");
  }

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (!file) return;

    let cancelled = false;
    let audioContext: AudioContext | null = null;

    async function generateWaveform() {
      try {
        audioContext = new AudioContext();

        const buffer = await file!.arrayBuffer();
        const audioBuffer =
          await audioContext.decodeAudioData(buffer);

        if (cancelled) return;

        const channel = audioBuffer.getChannelData(0);
        const samples = 1500;
        const blockSize = Math.max(
          1,
          Math.floor(channel.length / samples)
        );

        const waveform: number[] = [];

        for (let i = 0; i < samples; i++) {
          const start = i * blockSize;
          const end = Math.min(
            start + blockSize,
            channel.length
          );

          let max = 0;

          for (let j = start; j < end; j++) {
            max = Math.max(max, Math.abs(channel[j]));
          }

          waveform.push(max);
        }

        if (!cancelled) setPeaks(waveform);
      } catch {
        if (!cancelled) {
          setError("Unable to generate audio waveform.");
        }
      } finally {
        if (audioContext && audioContext.state !== "closed") {
          await audioContext.close();
        }
      }
    }

    generateWaveform();

    return () => {
      cancelled = true;
      if (audioContext && audioContext.state !== "closed") {
        audioContext.close();
      }
    };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !peaks.length) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = 110 * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = 110;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    const maxAmplitude = Math.max(...peaks, 0.001);

    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      const index = Math.min(
        peaks.length - 1,
        Math.floor((x / width) * peaks.length)
      );

      const amplitude = peaks[index] / maxAmplitude;
      const y = centerY - amplitude * centerY * 0.95;

      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    for (let x = width - 1; x >= 0; x--) {
      const index = Math.min(
        peaks.length - 1,
        Math.floor((x / width) * peaks.length)
      );

      const amplitude = peaks[index] / maxAmplitude;
      const y = centerY + amplitude * centerY * 0.95;

      ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fillStyle = "#2563eb";
    ctx.fill();

    if (selectedRange && duration > 0) {
      const x1 = (selectedRange.start / duration) * width;
      const x2 = (selectedRange.end / duration) * width;

      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(x1, 0, x2 - x1, height);
    }

    if (duration > 0) {
      const x = (currentTime / duration) * width;

      ctx.fillStyle = "#ef4444";
      ctx.fillRect(x, 0, 2, height);
    }
  }, [peaks, selectedRange, currentTime, duration]);

  function getTimeFromPosition(
    e: React.PointerEvent<HTMLCanvasElement>
  ) {
    const rect = e.currentTarget.getBoundingClientRect();

    const x = Math.max(
      0,
      Math.min(e.clientX - rect.left, rect.width)
    );

    return (x / rect.width) * duration;
  }

  function handlePointerDown(
    e: React.PointerEvent<HTMLCanvasElement>
  ) {
    if (!duration) return;

    e.currentTarget.setPointerCapture(e.pointerId);

    const time = getTimeFromPosition(e);
    dragStart.current = time;

    if (
      selectedRange &&
      selectedRange.end > selectedRange.start &&
      time >= selectedRange.start &&
      time <= selectedRange.end
    ) {
      dragMode.current = "move";
      rangeAtDragStart.current = selectedRange;
      return;
    }

    dragMode.current = "select";
    rangeAtDragStart.current = null;
    setSelectedRange({ start: time, end: time });
  }

  function handlePointerMove(
    e: React.PointerEvent<HTMLCanvasElement>
  ) {
    if (dragStart.current === null || !dragMode.current) return;

    const time = getTimeFromPosition(e);

    if (dragMode.current === "move" && rangeAtDragStart.current) {
      const originalRange = rangeAtDragStart.current;
      const rangeLength = originalRange.end - originalRange.start;
      const nextStart = Math.max(
        0,
        Math.min(
          originalRange.start + time - dragStart.current,
          duration - rangeLength
        )
      );

      setSelectedRange({
        start: nextStart,
        end: nextStart + rangeLength,
      });
    } else {
      setSelectedRange({
        start: Math.min(dragStart.current, time),
        end: Math.max(dragStart.current, time),
      });
    }
  }

  function handlePointerUp() {
    dragStart.current = null;
    dragMode.current = null;
    rangeAtDragStart.current = null;
  }

  function formatTime(time: number) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-bold">Video Editor</h1>
          <p className="text-sm text-slate-400 mt-1">
            Upload and select a portion of your video.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <label className="block mb-3 font-medium">
            Upload Video
          </label>

          <input
            type="file"
            accept="video/*"
            onChange={handleUpload}
            className="block w-full text-sm text-slate-400
              file:mr-4 file:rounded-lg file:border-0
              file:bg-blue-600 file:px-4 file:py-2
              file:text-white"
          />

          {file && (
            <p className="text-xs text-slate-400 mt-2">
              {file.name}
            </p>
          )}
        </div>

        {videoUrl && (
          <>
            <div className="relative bg-black rounded-xl overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full max-h-[450px]"
                onLoadedMetadata={(e) =>
                  setDuration(e.currentTarget.duration)
                }
                onTimeUpdate={(e) =>
                  setCurrentTime(e.currentTarget.currentTime)
                }
              />
              {currentSegment && (
                <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
                  <span className="text-white bg-black/50 text-center font-semibold py-2 px-4 rounded-lg">
                    {currentSegment.text}
                  </span>
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">

              <div className="flex justify-between mb-4">
                <h2 className="font-semibold">
                  Audio Timeline
                </h2>

                <span className="text-xs text-slate-400">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {peaks.length > 0 ? (
                <>
                  <canvas
                    ref={canvasRef}
                    className={`w-full h-[110px] touch-none ${
                      selectedRange ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
                    }`}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  />

                  <p className="text-xs text-slate-400 mt-3">
                    Drag across the waveform to select a range. Drag inside the highlighted range to move it.
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400 py-8 text-center">
                  Generating waveform...
                </p>
              )}

              {selectedRange && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-800/60 bg-blue-950/50 p-3 text-sm">
                  <p>
                    Selected range:{" "}
                    <span className="font-semibold text-blue-300">
                      {formatTime(selectedRange.start)}
                      {" - "}
                      {formatTime(selectedRange.end)}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">
                      Drag the highlighted range to reposition it.
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={handleCancelRange}
                    className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800"
                  >
                    Cancel range
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        <div className="space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div>
            <h2 className="font-semibold">Add Text</h2>
            <p className="mt-1 text-sm text-slate-400">
              Select a range, enter its text, and save it to Supabase.
            </p>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text for the selected range"
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-white placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={handleAddSegment}
              disabled={!selectedRange || !text.trim() || isSaving || isLoadingSegments}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-medium transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save segment"}
            </button>
          </div>

          <div className="border-t border-slate-800 pt-4">
            <h2 className="font-semibold">Saved Text Segments</h2>
            {isLoadingSegments ? (
              <p className="mt-2 text-sm text-slate-400">
                Loading saved timestamps...
              </p>
            ) : segments.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">
                Saved text and timestamps will appear here.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {segments.map((segment) => (
                  <li
                    key={segment.id}
                    className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="break-words font-medium">{segment.text}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                      <label className="flex items-center gap-2">
                        <span>Start</span>
                        <input
                          type="number"
                          min={0}
                          max={duration || undefined}
                          step={0.1}
                          value={segment.start}
                          onChange={(e) =>
                            updateSegmentTime(
                              segment.id,
                              "start",
                              e.currentTarget.valueAsNumber
                            )
                          }
                          className="w-24 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-white"
                          aria-label={`Start time for ${segment.text}`}
                        />
                      </label>
                      <label className="flex items-center gap-2">
                        <span>End</span>
                        <input
                          type="number"
                          min={0}
                          max={duration || undefined}
                          step={0.1}
                          value={segment.end}
                          onChange={(e) =>
                            updateSegmentTime(
                              segment.id,
                              "end",
                              e.currentTarget.valueAsNumber
                            )
                          }
                          className="w-24 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-white"
                          aria-label={`End time for ${segment.text}`}
                        />
                      </label>
                      <span className="text-xs text-slate-400">
                        {formatTime(segment.start)} - {formatTime(segment.end)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateSegment(segment.id)}
                        disabled={updatingSegmentId === segment.id}
                        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {updatingSegmentId === segment.id
                          ? "Updating..."
                          : "Save changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSegment(segment.id)}
                        disabled={deletingSegmentId === segment.id}
                        className="rounded-md border border-red-800 px-3 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingSegmentId === segment.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

      </div>
    </div>
  );
}

export default App;
