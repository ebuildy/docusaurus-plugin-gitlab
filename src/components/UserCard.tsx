import React from "react";
import type { UserShowToken } from "../gitlab/users.js";
import { formatDate } from "./formatDate.js";
import type { UserData } from "./types.js";

/** One emoji-prefixed profile line; the emoji is decorative and hidden from AT. */
function InfoLine({ className, emoji, children }: { className: string; emoji: string; children: React.ReactNode }) {
  return (
    <p className={className}>
      <span className="gitlab-user-emoji" aria-hidden="true">
        {emoji}
      </span>{" "}
      {children}
    </p>
  );
}

/** One user card. `show` is the parsed token list; identity always renders. */
export function UserCard({ user, show }: { user: UserData; show: readonly UserShowToken[] }) {
  const has = (t: UserShowToken) => show.includes(t);
  const orgLine = [user.jobTitle, user.organization].filter(Boolean).join(" · ");
  const counts = [
    user.followers !== null ? `${user.followers} followers` : null,
    user.following !== null ? `${user.following} following` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const info = [
    has("org") && orgLine && (
      <InfoLine key="org" className="gitlab-user-org" emoji="💼">
        {orgLine}
      </InfoLine>
    ),
    has("location") && user.location && (
      <InfoLine key="location" className="gitlab-user-location" emoji="📍">
        {user.location}
      </InfoLine>
    ),
    has("bio") && user.bio && (
      <InfoLine key="bio" className="gitlab-user-bio" emoji="📝">
        {user.bio}
      </InfoLine>
    ),
    has("counts") && counts && (
      <InfoLine key="counts" className="gitlab-user-counts" emoji="👥">
        {counts}
      </InfoLine>
    ),
    has("since") && user.createdAt && (
      <InfoLine key="since" className="gitlab-user-since" emoji="📅">
        Member since {formatDate(user.createdAt)}
      </InfoLine>
    ),
  ].filter(Boolean);
  return (
    <div className="gitlab-card gitlab-user-card">
      <div className="gitlab-card-header gitlab-user-card-header">
        {user.avatarUrl && (
          <img className="gitlab-avatar" src={user.avatarUrl} alt={user.name} width={48} height={48} />
        )}
        <div className="gitlab-user-identity">
          <strong className="gitlab-user-name">{user.name}</strong>
          <a className="gitlab-user-username" href={user.webUrl}>
            @{user.username}
          </a>
          {has("role") && user.role && <span className="gitlab-badge gitlab-user-role">{user.role}</span>}
        </div>
      </div>
      {info.length > 0 && <div className="gitlab-user-info">{info}</div>}
    </div>
  );
}
