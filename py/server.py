from fastapi import FastAPI

app = FastAPI()


@app.post("/add_numbers")
def add_numbers(body: dict):
    return {"result": body["a"] + body["b"]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
