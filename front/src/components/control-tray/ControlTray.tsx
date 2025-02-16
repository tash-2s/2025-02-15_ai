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

const pro = "Summarize the recent moments in the video."

let counter = 0

function ControlTray() {
  const videoStreams = [useScreenCapture()];
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [screenCapture] = videoStreams;
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);

  const { setConfig, client, connected, connect, disconnect } =
    useLiveAPIContext();

  const [yurl, setYurl] = useState("https://www.youtube.com/watch?v=sOFmYwYa9Pk");
  const [isPlay, setIsPlay] = useState(false)

  const play = () => {
    setIsPlay(true)
  }

  const handleSummarize = async () => {
    const s = await summarize(yurl)
    speakText(s)
  }

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: "audio",
      },
      systemInstruction: {
        parts: [
          {
            text: `You are a screen reader providing brief, natural descriptions of video content. Capture the overall flow of scenes, key actions, and transitions in a concise and self-contained manner.

Start describing immediately without any acknowledgments or introductions. Do not say "OK" or anything similar—just begin describing the content. Avoid unnecessary lead-ins like "The video shows..."—jump straight into the description.

Ignore all YouTube interface elements, including control panels, buttons, progress bars, or overlays. Only describe what is happening in the actual video.

Prioritize the flow of scenes rather than static details. Focus on what is changing and moving rather than describing every small object. Keep up with the pace of the video—if scenes change quickly, keep descriptions brief to stay synchronized.

Each response must be short, self-contained, and focused on recent moments. Do not attempt to continue previous descriptions; treat each as a standalone update on the latest part of the video. Summarize efficiently and avoid lingering on past frames.

Keep responses short and to the point. No unnecessary introductions—just describe.`
          },
        ],
      },
    })
  }, [setConfig])

  useEffect(() => {
    client.on("log", console.log)

    client.on("turncomplete", () => {
      counter++
      if (counter % 2 === 0) {
        setTimeout(() => {
          client.send({ text: pro })
        }, 300)
      }
    })
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

  return <>
    <div className="main-app-area">
      <div>
        <input
          type="text"
          placeholder="Enter YouTube URL"
          size={50}
          value={yurl}
          onChange={e => setYurl(e.target.value)}
        />
        {" "}
        <button type="button" onClick={play}>Play</button>
      </div>
      <br />
      <br />
      <div id="yt-embed">
        {isPlay ? <YoutubeEmbed yurl={yurl} /> : <></>}
      </div>
    </div>
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
        <div className="connection-button-container">
          <button
            className={"action-button"}
            onClick={handleSummarize}
          >
            <span className="material-symbols-outlined filled">
              Summarize
            </span>
          </button>
        </div>
      </div>
    </section>
  </>;
}

export default memo(ControlTray);

const YoutubeEmbed = ({ yurl }: { yurl: string }) => {
  const embedId = yurl.split('?v=')[1]
  return <iframe
      width="480"
      height="270"
      src={`https://www.youtube.com/embed/${embedId}?autoplay=1`}
      style={{border:0, display: "block" }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title="Embedded youtube"
    />
}

const summarize = async (url: string) => {
  const r = await fetch(
    `http://127.0.0.1:8000/summarize`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url }),
    }
  ).then(r => r.json())

  return r.summary as string
}

function speakText(text: string) {
  if (!window.speechSynthesis) {
    alert("Text-to-Speech is not supported in this browser.");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  window.speechSynthesis.speak(utterance);
}
