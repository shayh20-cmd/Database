export function aggregateVotes(votes, activities) {
  const total = votes.length;
  const counts = new Map(activities.map((activity) => [activity.id, 0]));

  for (const vote of votes) {
    if (counts.has(vote.activityId)) {
      counts.set(vote.activityId, counts.get(vote.activityId) + 1);
    }
  }

  return activities.map((activity) => {
    const count = counts.get(activity.id);
    const percent = total === 0 ? 0 : Math.round((count / total) * 100);
    return { id: activity.id, name: activity.name, count, percent };
  });
}
