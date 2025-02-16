/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import cn from "classnames";

import { memo, useEffect, useRef, useState } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { UseMediaStreamResult } from "../../hooks/use-media-stream-mux";
import { useScreenCapture } from "../../hooks/use-screen-capture";
import "./control-tray.scss";

const pro = "Start describing the video immediately and continuously."

function ControlTray() {
  const videoStreams = [useScreenCapture()];
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [screenCapture] = videoStreams;
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);

  const { setConfig, client, connected, connect, disconnect } =
    useLiveAPIContext();

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: "audio",
      },
      systemInstruction: {
        parts: [
          {
            text: "You are a highly accurate and continuous screen reader. You will receive video input and must provide a real-time, concise, and clear description of what is happening on the screen. Start describing the video content immediately without any acknowledgments or introductions. Do not say 'OK' or anything similar—just begin describing what you see. Ignore any YouTube interface elements, including control panels, buttons, progress bars, or overlays. Only describe the actual video content. Prioritize describing the most recent scene while maintaining a natural flow. Adjust your pace to match the video's rhythm—if the scene changes rapidly, shorten your descriptions to keep up. If the scene is slower, provide more detail. Avoid lingering too long on past frames, but do not abruptly cut off mid-description. Keep describing without pausing, as the video is continuously progressing. Only stop if I explicitly instruct you to do so.",
          },
        ],
      },
    })
  }, [setConfig])

  useEffect(() => {
    client.on("log", console.log)
    client.on("turncomplete", () => client.send({ text: pro }))
    return () => {client.off("log", console.log)}
  }, [client])

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--volume",
      `5px`,
    );
  }, []);

  useEffect(() => {
    let timeoutId = -1;

    async function sendVideoFrame() {
      const canvas = renderCanvasRef.current;

      if (!activeVideoStream || !canvas) {
        return;
      }

      const videoTrack = activeVideoStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error("No video track found in MediaStream.");
      }

      const imageCapture = new (globalThis as any).ImageCapture(videoTrack)
      const bitmap = await imageCapture.grabFrame();

      const ctx = canvas.getContext("2d")!;
      canvas.width = bitmap.width * 0.5;
      canvas.height = bitmap.height * 0.5;
      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 1.0);
        const data = base64.slice(base64.indexOf(",") + 1, Infinity);
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      }
      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 2000);
      }
    }
    if (connected && activeVideoStream !== null) {
      requestAnimationFrame(sendVideoFrame);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [connected, activeVideoStream, client]);

  //handler for swapping from one video-stream to the next
  const changeStreams = async (next?: UseMediaStreamResult) => {
    if (next) {
      const mediaStream = await next.start();
      setActiveVideoStream(mediaStream);
    } else {
      setActiveVideoStream(null);
    }

    videoStreams.filter((msr) => msr !== next).forEach((msr) => msr.stop());
  };

  const start = async () => {
    await changeStreams(screenCapture)
    await connect()
    await new Promise(resolve => setTimeout(resolve, 1000))
    client.send({ text: pro })
  }

  return (
    <section className="control-tray">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />

      <div className={cn("connection-container", { connected })}>
        <div className="connection-button-container">
          <button
            ref={connectButtonRef}
            className={cn("action-button connect-toggle", { connected })}
            onClick={connected ? () => changeStreams().then(disconnect) : start }
          >
            <span className="material-symbols-outlined filled">
              {connected ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>
        <span className="text-indicator">Streaming</span>
      </div>
    </section>
  );
}

export default memo(ControlTray);
