import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { UserProvider } from "./UserContext";

import { Provider } from "react-redux";
import { store, persistor } from "./store";
import { PersistGate } from "redux-persist/integration/react";

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
   <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
         <UserProvider>
            <App />
         </UserProvider>
      </PersistGate>
   </Provider>
);
