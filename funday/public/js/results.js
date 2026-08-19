export function aggregateVotes(votes, activities) {
  const total = votes.length;
  const counts = new Map(activities.map((activity) => [activity.id, 0]));
  const voters = new Map(activities.map((activity) => [activity.id, []]));

  for (const vote of votes) {
    if (!counts.has(vote.activityId)) continue;
    counts.set(vote.activityId, counts.get(vote.activityId) + 1);
    // A vote still counts without a usable name, it just can't be listed by name.
    const name = typeof vote.employeeName === 'string' ? vote.employeeName.trim() : '';
    if (name) voters.get(vote.activityId).push(name);
  }

  return activities.map((activity) => {
    const count = counts.get(activity.id);
    const percent = total === 0 ? 0 : Math.round((count / total) * 100);
    return { id: activity.id, name: activity.name, count, percent, voters: voters.get(activity.id) };
  });
}
