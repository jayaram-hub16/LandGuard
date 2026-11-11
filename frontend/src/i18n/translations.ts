// LandGuard i18n — English and Telugu translations
// Feature 8: Telugu + English language support

export type LangCode = 'en' | 'te'

const translations = {
  en: {
    // Navigation
    nav_dashboard:    'Dashboard',
    nav_map:          'GIS Map',
    nav_parcels:      'Land Parcels',
    nav_detections:   'Detections',
    nav_cases:        'Case Management',
    nav_surveys:      'Field Surveys',
    nav_complaints:   'Citizen Portal',
    nav_reports:      'Reports',
    nav_ai:           'AI Detection',
    nav_admin:        'Admin Dashboard',
    nav_users:        'User Management',
    nav_audit:        'Audit Logs',
    nav_settings:     'Settings',
    nav_signout:      'Sign Out',
    nav_admin_section:'Administration',

    // Common
    save:             'Save',
    cancel:           'Cancel',
    submit:           'Submit',
    edit:             'Edit',
    delete:           'Delete',
    search:           'Search',
    loading:          'Loading...',
    refresh:          'Refresh',
    back:             'Back',
    close:            'Close',
    yes:              'Yes',
    no:               'No',
    required:         'Required',
    optional:         'Optional',
    status:           'Status',
    priority:         'Priority',
    date:             'Date',
    notes:            'Notes',
    actions:          'Actions',
    nodata:           'No data found.',

    // Complaints Portal
    portal_title:       'Citizen Complaint Portal',
    portal_subtitle:    'Report suspected land encroachment. Your complaint will be reviewed by our team.',
    complaint_name:     'Your Full Name',
    complaint_email:    'Email Address',
    complaint_phone:    'Phone Number',
    complaint_desc:     'Describe the suspected encroachment',
    complaint_location: 'Location / Village / Address',
    complaint_parcel:   'Related Parcel ID (if known)',
    complaint_submit:   'Submit Complaint',
    complaint_track:    'Track My Complaint',
    complaint_ack:      'Acknowledgment Number',
    complaint_status:   'Check Complaint Status',
    complaint_check:    'Check Status',
    disclaimer_complaint: 'A complaint is NOT proof of encroachment. All complaints are reviewed before any action is taken.',

    // Cases
    cases_title:        'Case Management',
    case_number:        'Case Number',
    case_title:         'Case Title',
    case_status:        'Status',
    case_priority:      'Priority',
    case_surveyor:      'Assigned Surveyor',
    case_reviewer:      'Assigned Reviewer',
    case_deadline:      'Deadline',
    case_open:          'Open Case',
    case_assign:        'Assign',
    case_history:       'Status History',
    case_evidence:      'Evidence',
    case_overdue:       'OVERDUE',

    // Field Surveys
    surveys_title:      'Field Surveys',
    survey_number:      'Survey Number',
    survey_date:        'Survey Date',
    survey_area:        'Observed Area',
    survey_accuracy:    'GPS Accuracy (m)',
    survey_land_use:    'Land Use Observed',
    survey_encroach:    'Encroachment Found?',
    survey_submit:      'Submit Survey',
    survey_draft:       'Save Draft',
    survey_disclaimer:  'This is a field observation record. It does not constitute a legal determination.',

    // Parcels / Status
    parcel_id:          'Parcel ID',
    parcel_area:        'Registered Area',
    parcel_owner:       'Owner',
    parcel_district:    'District',
    parcel_state:       'State',
    parcel_use:         'Land Use',
    parcel_flagged:     'Encroachment Flagged',
    parcel_add:         'Add Parcel',
    parcel_download:    'Download PDF',
    parcel_print:       'Print',

    // Roles
    role_admin:    'Administrator',
    role_surveyor: 'Surveyor',
    role_reviewer: 'Reviewer / Officer',
    role_citizen:  'Citizen / Landowner',
    role_user:     'User',
  },

  te: {
    // Navigation
    nav_dashboard:    'డాష్‌బోర్డ్',
    nav_map:          'GIS మ్యాప్',
    nav_parcels:      'భూమి పార్సెల్స్',
    nav_detections:   'అతిక్రమణలు',
    nav_cases:        'కేస్ నిర్వహణ',
    nav_surveys:      'క్షేత్ర సర్వేలు',
    nav_complaints:   'పౌర పోర్టల్',
    nav_reports:      'నివేదికలు',
    nav_ai:           'ఏఐ గుర్తింపు',
    nav_admin:        'అడ్మిన్ డాష్‌బోర్డ్',
    nav_users:        'వినియోగదారు నిర్వహణ',
    nav_audit:        'ఆడిట్ లాగ్‌లు',
    nav_settings:     'సెట్టింగ్‌లు',
    nav_signout:      'సైన్ అవుట్',
    nav_admin_section:'నిర్వహణ',

    // Common
    save:             'సేవ్ చేయండి',
    cancel:           'రద్దు చేయండి',
    submit:           'సమర్పించండి',
    edit:             'సవరించండి',
    delete:           'తొలగించండి',
    search:           'వెతకండి',
    loading:          'లోడ్ అవుతోంది...',
    refresh:          'రిఫ్రెష్',
    back:             'వెనుకకు',
    close:            'మూసివేయండి',
    yes:              'అవును',
    no:               'లేదు',
    required:         'అవసరం',
    optional:         'ఐచ్ఛికం',
    status:           'స్థితి',
    priority:         'ప్రాధాన్యత',
    date:             'తేదీ',
    notes:            'గమనికలు',
    actions:          'చర్యలు',
    nodata:           'డేటా కనుగొనబడలేదు.',

    // Complaints Portal
    portal_title:       'పౌర ఫిర్యాదు పోర్టల్',
    portal_subtitle:    'అనుమానిత భూమి అతిక్రమణను నివేదించండి. మీ ఫిర్యాదును మా బృందం సమీక్షిస్తుంది.',
    complaint_name:     'మీ పూర్తి పేరు',
    complaint_email:    'ఇమెయిల్ చిరునామా',
    complaint_phone:    'ఫోన్ నంబర్',
    complaint_desc:     'అనుమానిత అతిక్రమణను వివరించండి',
    complaint_location: 'స్థానం / గ్రామం / చిరునామా',
    complaint_parcel:   'సంబంధిత పార్సెల్ ID (తెలిస్తే)',
    complaint_submit:   'ఫిర్యాదు సమర్పించండి',
    complaint_track:    'నా ఫిర్యాదును ట్రాక్ చేయండి',
    complaint_ack:      'అంగీకృత సంఖ్య',
    complaint_status:   'ఫిర్యాదు స్థితి తనిఖీ చేయండి',
    complaint_check:    'స్థితి తనిఖీ',
    disclaimer_complaint: 'ఫిర్యాదు అతిక్రమణకు రుజువు కాదు. చర్య తీసుకోవడానికి ముందు అన్ని ఫిర్యాదులు సమీక్షించబడతాయి.',

    // Cases
    cases_title:        'కేస్ నిర్వహణ',
    case_number:        'కేస్ నంబర్',
    case_title:         'కేస్ శీర్షిక',
    case_status:        'స్థితి',
    case_priority:      'ప్రాధాన్యత',
    case_surveyor:      'నియమించిన సర్వేయర్',
    case_reviewer:      'నియమించిన సమీక్షకుడు',
    case_deadline:      'గడువు',
    case_open:          'కేస్ తెరవండి',
    case_assign:        'కేటాయించండి',
    case_history:       'స్థితి చరిత్ర',
    case_evidence:      'సాక్ష్యాలు',
    case_overdue:       'గడువు మించింది',

    // Field Surveys
    surveys_title:      'క్షేత్ర సర్వేలు',
    survey_number:      'సర్వే నంబర్',
    survey_date:        'సర్వే తేదీ',
    survey_area:        'గమనించిన వైశాల్యం',
    survey_accuracy:    'GPS ఖచ్చితత్వం (మీ)',
    survey_land_use:    'గమనించిన భూ వినియోగం',
    survey_encroach:    'అతిక్రమణ కనుగొనబడిందా?',
    survey_submit:      'సర్వే సమర్పించండి',
    survey_draft:       'ముసాయిదాను సేవ్ చేయండి',
    survey_disclaimer:  'ఇది క్షేత్ర పరిశీలన రికార్డు. ఇది చట్టపరమైన నిర్ణయాన్ని కలిగి ఉండదు.',

    // Parcels / Status
    parcel_id:          'పార్సెల్ ID',
    parcel_area:        'నమోదు చేయబడిన వైశాల్యం',
    parcel_owner:       'యజమాని',
    parcel_district:    'జిల్లా',
    parcel_state:       'రాష్ట్రం',
    parcel_use:         'భూ వినియోగం',
    parcel_flagged:     'అతిక్రమణ గుర్తించబడింది',
    parcel_add:         'పార్సెల్ జోడించండి',
    parcel_download:    'PDF డౌన్‌లోడ్ చేయండి',
    parcel_print:       'ముద్రించండి',

    // Roles
    role_admin:    'నిర్వాహకుడు',
    role_surveyor: 'సర్వేయర్',
    role_reviewer: 'సమీక్షకుడు / అధికారి',
    role_citizen:  'పౌరుడు / భూ యజమాని',
    role_user:     'వినియోగదారు',
  },
} as const

export type TranslationKey = keyof typeof translations.en
export type Translations = typeof translations.en

export function getTranslations(lang: LangCode): Translations {
  return translations[lang] as Translations
}

export { translations }
