FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY *.py ./
COPY scaler.pkl ./
COPY nba_tuned_model.json ./
COPY latest_states.pkl ./
COPY models/ ./models/

CMD ["uvicorn", "agent_logic:app", "--host", "0.0.0.0", "--port", "8000"]

