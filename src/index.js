import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { UserProvider } from "./UserContext";

// 🟢 importuri Redux
import { Provider } from "react-redux";
import { store } from "./store"; // fișierul store/index.js creat anterior

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
   <React.StrictMode>
      <Provider store={store}>
         <UserProvider>
            <App />
         </UserProvider>
      </Provider>
   </React.StrictMode>
);
