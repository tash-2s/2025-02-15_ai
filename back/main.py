from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
from llama_index.llms.together import TogetherLLM
from llama_index.core.llms import ChatMessage
import re
import os

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

llm = TogetherLLM(
  model="meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo-128K", api_key=os.environ["TOGETHER_API_KEY"]
)

class Video(BaseModel):
    url: str

@app.put("/summarize")
def summarize(video: Video):
    print(video)

    video_id = parse_youtube_url(video.url)
    print(video_id)

    transcript = YouTubeTranscriptApi.get_transcript(video_id)
    transcript_text = clean_transcript_text(transcript)
    print(transcript_text)

    summary_text = _summarize(transcript_text)
    print(summary_text)

    return {"summary": summary_text}

def parse_youtube_url(url: str)->str:
    data = re.findall(r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", url)
    if data:
        return data[0]
    raise ValueError("Invalid YouTube URL")

def clean_transcript_text(transcript):
    transcript_text = ' '.join(
        item['text'].replace('\n', ' ').strip() for item in transcript
    )
    return ' '.join(transcript_text.split())

def _summarize(transcript_text):
    messages = [
        ChatMessage(
            role="system", content="""
You are given a transcript from a YouTube video. Your task is to generate a concise and professional reading script that summarizes the key points of the video. The script should be structured as if spoken by a news presenter or journalist, delivering an objective and engaging summary.

Requirements:

- Maintain a neutral, third-person perspective, avoiding personal opinions or subjective interpretations.
- Use clear, engaging, and accessible language suited for a general audience.
- Ensure a smooth, natural flow, making it easy to read aloud.
- Keep the tone professional and objective, focusing on factual content rather than the creator’s perspective.
- The script must be concise enough to be spoken in under 1 minute at a natural speaking pace.

Guidelines:

- Do not include additional commentary, explanations, or metadata—only provide the finalized reading script.
- No introductions or conclusions like "This video is about..."—start directly with the key content.
- Focus on essential points and avoid unnecessary details to fit within the time limit."""
        ),
        ChatMessage(role="user", content=transcript_text),
    ]
    return llm.chat(messages)
