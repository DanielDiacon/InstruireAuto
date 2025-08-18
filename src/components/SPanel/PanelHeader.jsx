import React from "react";

export default function PanelHeader({ user }) {
  return (
    <div className="intro__left">
      <h2>
        Bine ai venit, <span className="highlight-name">{user ? user.firstName : "..."}</span>
      </h2>
      <p>
        Aici poți gestiona contul tău, programa lecții și vedea calendarul. 
        Îți dorim spor la învățat și o experiență plăcută în aplicație!
      </p>
    </div>
  );
}
