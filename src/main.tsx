import ReactDOM from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import App from './App'
import { applyTheme, readTheme } from './lib/theme'

applyTheme(readTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
