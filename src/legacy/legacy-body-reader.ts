import { legacyMessageBodyRepository } from './legacy-message-body-repository';

export interface LegacyBodyReader {
  findByIds(ids: readonly number[]): Promise<Map<number, string>>;
}

export function createLegacyBodyReader(): LegacyBodyReader {
  return {
    async findByIds(ids) {
      const bodies = await legacyMessageBodyRepository.findByIds(ids);
      return new Map(bodies.map(body => [body._id, body.body]));
    }
  };
}
