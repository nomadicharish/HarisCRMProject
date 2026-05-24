import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("firebase")) return "firebase";
          if (id.includes("react-select")) return "react-select";
          if (id.includes("react-datepicker") || id.includes("react-phone-input-2") || id.includes("libphonenumber-js")) {
            return "form-controls";
          }
          if (id.includes("@tanstack/react-query") || id.includes("axios")) return "data-client";
          return undefined;
        }
      }
    }
  }
})
