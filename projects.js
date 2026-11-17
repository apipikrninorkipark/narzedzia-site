import { database } from './database.js';

// Przykład dla zalogowanego użytkownika.
// Wymiary są zapisane razem z jednostką.
export async function saveProject(name, dimensions) {
  const { data, error } = await database
    .from('projects')
    .insert({ name, dimensions })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadProjects() {
  const { data, error } = await database
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}
