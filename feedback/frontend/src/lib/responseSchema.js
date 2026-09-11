// Schema of feedback_responses — must match Supabase columns exactly.

export const NUMERIC_QUESTION_COLS = [
    "how_would_you_rate_the_overall_content_of_the_session?",
    "were_the_topics_covered_relevant_to_your_needs_and_expectations",
    "rate_the_clarity_and_depth_of_the_information_provided",
    "how_knowledgeable_was_the_instructor_about the_subject_matter?",
    "how_engaging_was_the_instructor_in_delivering_the_content?",
    "rate_the_instructor's_ability_to_answer_questions_and_provide_e",
    "how_would_you_rate_the_overall_organization_and_flow_of_the_ses",
    "rate_the_activities/exercises_conducted_during_the_session_to_u",
    "rate_the_overall_interaction_and_engagement_opportunities_durin",
  ];
  
  export const TEXT_QUESTION_COLS = [
    "what_did_you_like_most_about_the_session?",
    "what_areas_do_you_think_need_improvement",
  ];
  
  export const ALL_QUESTION_COLS = [...NUMERIC_QUESTION_COLS, ...TEXT_QUESTION_COLS];
  
  // Friendly labels for the UI
  export const QUESTION_LABELS = {
    "how_would_you_rate_the_overall_content_of_the_session?": "Overall content",
    "were_the_topics_covered_relevant_to_your_needs_and_expectations": "Topic relevance",
    "rate_the_clarity_and_depth_of_the_information_provided": "Clarity & depth",
    "how_knowledgeable_was_the_instructor_about the_subject_matter?": "Instructor knowledge",
    "how_engaging_was_the_instructor_in_delivering_the_content?": "Instructor engagement",
    "rate_the_instructor's_ability_to_answer_questions_and_provide_e": "Q&A ability",
    "how_would_you_rate_the_overall_organization_and_flow_of_the_ses": "Organization & flow",
    "rate_the_activities/exercises_conducted_during_the_session_to_u": "Activities/exercises",
    "rate_the_overall_interaction_and_engagement_opportunities_durin": "Interaction & engagement",
    "what_did_you_like_most_about_the_session?": "Liked most",
    "what_areas_do_you_think_need_improvement": "Improvements",
  };
  