const endpointThresholds = latency => ({
  'http_req_duration{endpoint:conversation_list}': [`p(95)<${latency.conversationList}`],
  'http_req_duration{endpoint:message_list}': [`p(95)<${latency.messageList}`],
  'http_req_duration{endpoint:user_search}': [`p(95)<${latency.userSearch}`],
  'http_req_duration{endpoint:message_create}': [`p(95)<${latency.messageCreate}`]
});

const smokeScenario = exec => ({
  executor: 'shared-iterations',
  exec,
  vus: 1,
  iterations: 1,
  maxDuration: '30s'
});

const constantArrivalScenario = (exec, rate, duration, preAllocatedVUs, maxVUs) => ({
  executor: 'constant-arrival-rate',
  exec,
  rate,
  timeUnit: '1s',
  duration,
  preAllocatedVUs,
  maxVUs,
  gracefulStop: '10s'
});

const stressScenario = (exec, startRate, targets, preAllocatedVUs, maxVUs) => ({
  executor: 'ramping-arrival-rate',
  exec,
  startRate,
  timeUnit: '1s',
  preAllocatedVUs,
  maxVUs,
  stages: [
    { target: targets[0], duration: '20s' },
    { target: targets[1], duration: '20s' },
    { target: targets[2], duration: '20s' },
    { target: 0, duration: '10s' }
  ],
  gracefulStop: '15s'
});

export const performanceProfiles = {
  smoke: {
    description: 'One correctness iteration for every HTTP workload',
    scenarios: {
      conversation_list: smokeScenario('listConversations'),
      message_list: smokeScenario('listMessages'),
      user_search: smokeScenario('searchUsers'),
      message_create: smokeScenario('createMessage')
    },
    thresholds: {
      checks: ['rate==1'],
      http_req_failed: ['rate==0']
    }
  },
  baseline: {
    description: 'Low constant arrival rate used as the before-optimization baseline',
    scenarios: {
      conversation_list: constantArrivalScenario('listConversations', 2, '30s', 4, 12),
      message_list: constantArrivalScenario('listMessages', 4, '30s', 6, 20),
      user_search: constantArrivalScenario('searchUsers', 2, '30s', 4, 12),
      message_create: constantArrivalScenario('createMessage', 1, '30s', 4, 12)
    },
    thresholds: {
      checks: ['rate>0.999'],
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(95)<1200'],
      dropped_iterations: ['count==0'],
      ...endpointThresholds({
        conversationList: 1200,
        messageList: 750,
        userSearch: 500,
        messageCreate: 1000
      })
    }
  },
  load: {
    description: 'Sustained expected traffic through two API instances',
    scenarios: {
      conversation_list: constantArrivalScenario('listConversations', 10, '60s', 16, 50),
      message_list: constantArrivalScenario('listMessages', 20, '60s', 24, 80),
      user_search: constantArrivalScenario('searchUsers', 10, '60s', 16, 50),
      message_create: constantArrivalScenario('createMessage', 3, '60s', 12, 40)
    },
    thresholds: {
      checks: ['rate>0.999'],
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(95)<2000'],
      dropped_iterations: ['count==0'],
      ...endpointThresholds({
        conversationList: 2000,
        messageList: 1200,
        userSearch: 750,
        messageCreate: 1800
      })
    }
  },
  stress: {
    description: 'Ramping traffic used to expose the saturation point',
    scenarios: {
      conversation_list: stressScenario('listConversations', 2, [5, 10, 20], 20, 100),
      message_list: stressScenario('listMessages', 4, [10, 20, 40], 30, 150),
      user_search: stressScenario('searchUsers', 2, [5, 10, 20], 20, 100),
      message_create: stressScenario('createMessage', 1, [2, 4, 8], 16, 80)
    },
    thresholds: {
      checks: ['rate>0.99'],
      http_req_failed: ['rate<0.02']
    }
  }
};

export function getPerformanceProfile(name) {
  const profile = performanceProfiles[name];

  if (!profile) throw new Error(`Unknown performance profile: ${name}`);

  return profile;
}
