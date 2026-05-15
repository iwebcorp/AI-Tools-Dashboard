import { createRoot } from "react-dom/client"

import IndexPopup from "./popup"

const rootElement = document.getElementById("__plasmo")

if (!rootElement) {
  throw new Error("Popup root element not found")
}

createRoot(rootElement).render(<IndexPopup />)
