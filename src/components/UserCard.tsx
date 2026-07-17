import React from "react";
import type { UserShowToken } from "../gitlab/users.js";
import { formatDate } from "./formatDate.js";
import type { UserData } from "./types.js";

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
      {has("org") && orgLine && <p className="gitlab-user-org">{orgLine}</p>}
      {has("location") && user.location && <p className="gitlab-user-location">{user.location}</p>}
      {has("bio") && user.bio && <p className="gitlab-user-bio">{user.bio}</p>}
      {has("counts") && counts && <p className="gitlab-user-counts">{counts}</p>}
      {has("since") && user.createdAt && (
        <p className="gitlab-user-since">Member since {formatDate(user.createdAt)}</p>
      )}
    </div>
  );
}
