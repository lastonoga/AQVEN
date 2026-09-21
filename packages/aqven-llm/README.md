# aqven-llm

Provider isolation for [aqven](https://pypi.org/project/aqven/). Every import of a model provider SDK lives
here, behind one factory: the rest of the engine receives a ready `Model` and never imports `openai`,
`anthropic`, `google.genai` or the provider modules of Pydantic AI.

Install the provider you need as an extra:

```bash
uv add "aqven-llm[anthropic]"
```

Documentation: https://aqvenstudio.com
