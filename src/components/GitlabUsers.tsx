import React from "react";
import { parseShow } from "../gitlab/users.js";
import { Fallback } from "./Fallback.js";
import { UserCard } from "./UserCard.js";
import { cardsGridStyle, type ComponentLayout } from "./layout.js";
import type { ComponentPayload, UserData } from "./types.js";

interface GitlabUsersProps extends ComponentPayload<UserData[]>, ComponentLayout {
  /** Comma-separated card sections; validated at build time by the fetcher. */
  show?: string;
}

export function GitlabUsers({
  data,
  error,
  show,
  cardColumns,
  cardMinWidth,
  gap,
  maxWidth,
  align,
}: GitlabUsersProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  const tokens = parseShow(show, "GitlabUsers");
  return (
    <div
      className="gitlab-user-cards"
      style={cardsGridStyle({ cardColumns, cardMinWidth: cardMinWidth ?? "260px", gap, maxWidth, align })}
    >
      {data.map((u) => (
        <UserCard key={u.username} user={u} show={tokens} />
      ))}
    </div>
  );
}
