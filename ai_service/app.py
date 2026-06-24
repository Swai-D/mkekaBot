from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
import json

app = FastAPI()

# Pakia model mara moja tu wakati server inawaka
MODEL_PATH = "./models/mkekabot_v34_final"
tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForCausalLM.from_pretrained(MODEL_PATH, device_map="auto", torch_dtype=torch.float16)

class MatchData(BaseModel):
    home_team: str
    away_team: str
    referee_career_avg: float
    referee_season_avg: float
    # ... weka na zile features zingine 20 za DataForge

@app.post("/predict")
def predict_cards(data: MatchData):
    # Tengeneza ule prompt muundo wa ChatML tulioutumia kwenye training
    user_prompt = (
        f"Predict yellow cards for MkekaBOT v3.4:\n"
        f"MATCH: {data.home_team} vs {data.away_team}\n"
        f"REF STATS: Career Avg: {data.referee_career_avg:.2f}, Season Avg: {data.referee_season_avg:.2f}"
    )
    
    messages = [
        {"role": "system", "content": "You are MkekaBOT v3.4. Respond with valid JSON only."},
        {"role": "user", "content": user_prompt}
    ]
    
    inputs = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True, return_tensors="pt").to("cuda" if torch.cuda.is_available() else "cpu")
    
    with torch.no_grad():
        outputs = model.generate(inputs, max_new_tokens=128, temperature=0.1)
        
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    # Hapa tunakata herufi ili kupata ile JSON pekee na kuirudisha kwenye dashboard
    return json.loads(response.split("assistant")[-1].strip())