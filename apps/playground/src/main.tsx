import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.js"
import "./index.css"

const container = document.getElementById("root")
if (container === null) throw new Error("не найден #root")

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
