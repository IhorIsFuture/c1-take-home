import { userRepository, type PublicUser } from '../repositories/user-repository';

export function searchUsers(userId: number, query: string, limit: number): Promise<PublicUser[]> {
  return userRepository.search(query, userId, limit);
}
