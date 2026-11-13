import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type AppLanguage = 'en' | 'bn';
export type AppTheme = 'dark' | 'light';

const TRANSLATIONS = {
  en: {
    // Navigation & Header
    homeFeed: 'Home Feed',
    explorePlayers: 'Explore Players',
    liveChat: 'Live Chat',
    communities: 'Communities',
    tournaments: 'Tournaments',
    notifications: 'Notifications',
    myProfile: 'My Profile',
    adminConsole: 'Admin Console',
    searchPlaceholder: 'Search Carrom players or posts...',
    recentNotifications: 'Recent Notifications',
    viewAll: 'View all',
    noNotificationsYet: 'No notifications yet.',
    signOut: 'Sign Out',
    lightMode: 'White Mode',
    darkMode: 'Dark Mode',
    languageLabel: 'বাংলা',
    feedMobile: 'Feed',
    exploreMobile: 'Explore',
    chatMobile: 'Inbox',
    alertsMobile: 'Alerts',
    profileMobile: 'Profile',
    // Feed & Stories
    playerStories: 'Stories',
    active24h: '24h',
    addStory: 'Add Story',
    whatsOnMind: "What's on your mind, {name}? Share a trick shot or match update...",
    photo: 'Photo',
    video: 'Video',
    publicAudience: 'Public',
    friendsAudience: 'Friends',
    publishPost: 'Publish',
    uploading: 'Uploading...',
    allFeed: 'All Feed',
    following: 'Following',
    shotsAndVideos: 'Media',
    noPostsYet: 'No posts in this feed yet',
    noPostsDesc: 'Share your latest Queen pocket, carrom board setup, or tournament win to kick off the conversation.',
    suggestedStrikers: 'Suggested Strikers',
    connectedAll: 'You are connected with everyone here!',
    profileBtn: 'Profile',
    upcomingTournaments: 'Tournaments',
    bracketBtn: 'Bracket',
    noTournamentsYet: 'No active tournaments yet.',
    carromClubs: 'Carrom Clubs',
    exploreBtn: 'Explore',
    noClubsYet: 'Create the first Carrom Club.',
    members: 'members',
    players: 'players',
    addYourStoryTitle: 'Add Your Story',
    addYourStorySubtitle: 'Share a Carrom highlight photo or short video. Automatically expires in 24 hours.',
    selectPhotoOrVideo: 'Select photo or video',
    storyCaptionPlaceholder: 'Optional story caption...',
    publishStory: 'Publish Story',
    // Post Card
    like: 'Like',
    comment: 'Comment',
    share: 'Share',
    reactions: 'reactions',
    commentsWord: 'comments',
    sharesWord: 'shares',
    writeComment: 'Write a comment...',
    noCommentsYet: 'No comments yet. Start the discussion!',
    editPost: 'Edit Post',
    deletePost: 'Delete Post',
    reportPost: 'Report Post',
    cancel: 'Cancel',
    saveChanges: 'Save Changes',
    submitReport: 'Submit Report',
    // Auth & Welcome
    welcomeTitle: 'Welcome to Carrom Hub, {name}',
    welcomeBody: 'You are now connected to the live Carrom Pool social feed, squad chats, and verified tournament brackets.',
    enterArena: 'Enter the Arena',
    signInTab: 'Sign In',
    createAccountTab: 'Create Account',
    welcomeBack: 'Welcome Back',
    welcomeBackSub: 'Sign in to join your Carrom squads and live feeds.',
    joinCarromHub: 'Join Carrom Hub',
    joinCarromHubSub: 'Create your player identity and start connecting.',
    continueGoogle: 'Continue with Google',
    signInBtn: 'Sign In to Carrom Hub',
    // Sections & Views
    exploreTitle: 'Explore Carrom Hub',
    exploreSub: 'Discover top strikers and trending trick-shot posts.',
    messagesTitle: 'Messages',
    groupsTitle: 'Carrom Community Groups',
    groupsSub: 'Join regional clubs, challenge squads, and chat with fellow Carrom enthusiasts.',
    createGroup: 'Create Group',
    tournamentsTitle: 'Tournaments',
    tournamentsSub: 'Compete in Carrom brackets and earn verified tournament titles.',
    createTournament: 'Create Tournament',
    leaderboard: 'Leaderboard',
    markAllRead: 'Mark All Read',
    editProfile: 'Edit Profile',
    privacySettings: 'Privacy Settings',
    follow: 'Follow',
    followingState: 'Following',
    messageBtn: 'Message',
    emailLabel: 'Email Address',
    phoneLabel: 'Phone Number',
    phonePlaceholder: '+880 1XXX-XXXXXX',
    passwordLabel: 'Password',
    rememberMe: 'Remember me',
    forgotPassword: 'Forgot password?',
    orContinueWith: 'or continue with',
    fullNameLabel: 'Full Name',
    usernameLabel: 'Username',
    confirmPasswordLabel: 'Confirm Password',
    termsAccept: 'I agree to the Carrom Hub Community Guidelines and Terms & Conditions.',
    recoverTab: 'Recovery',
    recoverTitle: 'Recover Account',
    recoverSub: 'Enter your registered email address and we will send a password reset link.',
    sendResetBtn: 'Send Reset Link',
    resetSentTitle: 'Reset Link Sent',
    resetSentDesc: 'We sent a password reset link to {email}. Please check your Inbox and Spam folder.',
    resendResetBtn: 'Resend Reset Link',
    backToSignIn: 'Back to Sign In',
    demoSectionTitle: 'Demo Account (With Permissions)',
    demoGoogleBtn: 'Demo Sign In (indhassan6050@gmail.com)',
    fillDemoEmail: 'Use Demo Email',
    optionalPhoto: 'Profile Photo (Optional)',
    tapToUploadPhoto: 'Tap to upload photo',
    verifyEmailTitle: 'Verify Your Email',
    verifyEmailDesc: 'We sent a verification link to {email}. Open your inbox, click the link, then tap Continue below.',
    verifiedContinueBtn: "I've Verified My Email",
    resendVerifyBtn: 'Resend Verification Email',
    resendWaitBtn: 'Verification Sent (Wait 30s)',
    useAnotherAccount: 'Sign out & use another account',
    facebookLabel: 'Facebook Profile / Username',
    tiktokLabel: 'TikTok Profile / Username',
    instagramLabel: 'Instagram Profile / Username',
    socialProfiles: 'Social Profiles',
    viewPublicProfile: 'View Public Profile',
    backToEditProfile: 'Back to Profile Controls',
    // Notifications / Explore / Chat / Groups / Tournaments / Profile extras
    allCaughtUp: 'You are all caught up',
    unreadUpdates: '{count} unread updates',
    noNotificationsDesc: 'Likes, comments, new followers, messages, and tournament alerts will appear here.',
    allDiscovery: 'All Discovery',
    playersTab: 'Players',
    trendingPosts: 'Trending Posts',
    popularPlayers: 'Popular Players',
    suggestedFriends: 'Suggested Friends',
    newMembers: 'New Members',
    popularCommunities: 'Popular Communities',
    openClubs: 'Open Clubs',
    searchChats: 'Search chats...',
    onlineNow: 'Online now',
    offlineStatus: 'Offline',
    typeMessage: 'Type a message...',
    recordingVoice: 'Recording voice message...',
    backToClubs: 'Back to Communities',
    openGroupChat: 'Open Group Chat',
    joinGroup: 'Join Group',
    leaveGroup: 'Leave Group',
    clubMembers: 'Club Members',
    postToClub: 'Post to Club',
    backToTournaments: 'Back to Tournaments',
    joinTournament: 'Join Tournament',
    submitMatchResult: 'Submit Match Result',
    followersLabel: 'Followers',
    followingLabel: 'Following',
    totalPostsLabel: 'Total Posts',
    titlesWonLabel: 'Titles Won',
    postsHeading: 'Posts',
    backToFeed: 'Back to Feed',
    inboxTitle: 'Inbox',
    inboxSub: 'Direct chats, squad rooms & live players',
    activePlayersNow: 'Active Strikers Now',
    allChats: 'All',
    unreadChats: 'Unread',
    directChats: 'Direct',
    groupChats: 'Groups',
    newChatBtn: 'New Chat',
    newGroupBtn: 'New Group',
    totalChatsStat: 'Total Chats',
    unreadStat: 'Unread',
    onlinePlayersStat: 'Online Now',
    inboxWelcomeTitle: 'Your Carrom Inbox',
    inboxWelcomeDesc: 'Message fellow strikers 1-on-1, share trick-shot clips, record voice notes, or coordinate squad matches in real time.',
    quickStartPlayers: 'Quick Message Active Players',
    searchPlayersPlaceholder: 'Search players by name or @username...',
    noMatchingChats: 'No matching conversations',
    noMatchingChatsDesc: 'Try another filter or start a new conversation with a Carrom player.',
    recentMessagers: 'Messages & Conversations',
    openLink: 'Open link',
    replyAction: 'Reply',
    emojiAction: 'React',
    deleteAction: 'Delete',
    cameraPhoto: 'Take Photo (Camera)',
    galleryPhoto: 'Upload Photo (Gallery)',
    shareVideo: 'Upload Video',
    appPermissions: 'App Permissions',
    permissionsSubtitle: 'Allow Microphone, Camera & Photo access for voice messages and media uploads on your phone.',
    micPermTitle: 'Voice & Microphone',
    micPermDesc: 'Required to record and send voice messages in chat.',
    cameraPermTitle: 'Camera & Photos',
    cameraPermDesc: 'Required to take photos and upload images or videos.',
    notifPermTitle: 'Notifications',
    notifPermDesc: 'Get instant alerts for new messages and replies.',
    allowBtn: 'Allow',
    grantedLabel: 'Allowed',
    blockedLabel: 'Blocked in Settings',
    allowAllPerms: 'Allow Voice & Photo Permissions',
    installAppBtn: 'Download / Install App',
    takePhotoTitle: 'Take Photo',
    snapPhoto: 'Capture & Send',
    switchCamera: 'Switch Camera',
    recordingCancel: 'Cancel',
    recordingSend: 'Send Voice',
    permissionsBannerTitle: 'Enable Phone Permissions',
    permissionsBannerDesc: 'Allow Voice (Mic) & Photo/Camera permissions to send voice notes and photos smoothly.',
    managePermissions: 'Permissions',
    iosInstallTitle: 'Install Carrom Hub on iPhone / iPad',
    iosInstallSteps: 'Tap the Share button in Safari, then choose "Add to Home Screen".',
  },
  bn: {
    // Navigation & Header
    homeFeed: 'হোম ফিড',
    explorePlayers: 'খুঁজুন',
    liveChat: 'লাইভ চ্যাট',
    communities: 'ক্লাবসমূহ',
    tournaments: 'টুর্নামেন্ট',
    notifications: 'নোটিফিকেশন',
    myProfile: 'আমার প্রোফাইল',
    adminConsole: 'অ্যাডমিন প্যানেল',
    searchPlaceholder: 'ক্যারম খেলোয়াড় বা পোস্ট খুঁজুন...',
    recentNotifications: 'সাম্প্রতিক নোটিফিকেশন',
    viewAll: 'সব দেখুন',
    noNotificationsYet: 'এখনো কোনো নোটিফিকেশন নেই।',
    signOut: 'সাইন আউট',
    lightMode: 'সাদা মুড',
    darkMode: 'ডার্ক মুড',
    languageLabel: 'EN',
    feedMobile: 'ফিড',
    exploreMobile: 'খুঁজুন',
    chatMobile: 'ইনবক্স',
    alertsMobile: 'নোটিফিকেশন',
    profileMobile: 'প্রোফাইল',
    // Feed & Stories
    playerStories: 'স্টোরিজ',
    active24h: '২৪ ঘণ্টা',
    addStory: 'স্টোরি যোগ',
    whatsOnMind: '{name}, আপনার মনের কথা লিখুন... ক্যারম শট বা ম্যাচ আপডেট শেয়ার করুন!',
    photo: 'ছবি',
    video: 'ভিডিও',
    publicAudience: 'পাবলিক',
    friendsAudience: 'বন্ধুরা',
    publishPost: 'পোস্ট করুন',
    uploading: 'আপলোড হচ্ছে...',
    allFeed: 'সব পোস্ট',
    following: 'ফলোয়িং',
    shotsAndVideos: 'ছবি ও ভিডিও',
    noPostsYet: 'এই ফিডে এখনো কোনো পোস্ট নেই',
    noPostsDesc: 'আপনার সেরা কুইন পকেট, ক্যারম বোর্ড সেটআপ বা জয়ের গল্প শেয়ার করে আলোচনা শুরু করুন।',
    suggestedStrikers: 'সাজেস্টেড খেলোয়াড়',
    connectedAll: 'আপনি সবার সাথে যুক্ত আছেন!',
    profileBtn: 'প্রোফাইল',
    upcomingTournaments: 'আসন্ন টুর্নামেন্ট',
    bracketBtn: 'ব্র্যাকেট',
    noTournamentsYet: 'কোনো চলমান টুর্নামেন্ট নেই।',
    carromClubs: 'ক্যারম ক্লাব',
    exploreBtn: 'দেখুন',
    noClubsYet: 'প্রথম ক্যারম ক্লাব তৈরি করুন।',
    members: 'সদস্য',
    players: 'খেলোয়াড়',
    addYourStoryTitle: 'আপনার স্টোরি যোগ করুন',
    addYourStorySubtitle: 'ক্যারমের দারুণ ছবি বা ছোট ভিডিও শেয়ার করুন। ২৪ ঘণ্টা পর স্বয়ংক্রিয়ভাবে মুছে যাবে।',
    selectPhotoOrVideo: 'ছবি বা ভিডিও নির্বাচন করুন',
    storyCaptionPlaceholder: 'স্টোরি ক্যাপশন লিখুন (ঐচ্ছিক)...',
    publishStory: 'স্টোরি প্রকাশ করুন',
    // Post Card
    like: 'লাইক',
    comment: 'কমেন্ট',
    share: 'শেয়ার',
    reactions: 'রিঅ্যাকশন',
    commentsWord: 'কমেন্ট',
    sharesWord: 'শেয়ার',
    writeComment: 'কমেন্ট লিখুন...',
    noCommentsYet: 'এখনো কোনো কমেন্ট নেই। প্রথম কমেন্ট করুন!',
    editPost: 'এডিট করুন',
    deletePost: 'মুছে ফেলুন',
    reportPost: 'রিপোর্ট করুন',
    cancel: 'বাতিল',
    saveChanges: 'সেভ করুন',
    submitReport: 'রিপোর্ট পাঠান',
    // Auth & Welcome
    welcomeTitle: 'ক্যারম হাবে স্বাগতম, {name}',
    welcomeBody: 'আপনি এখন লাইভ ক্যারম পুল সোশ্যাল ফিড, স্কোয়াড চ্যাট এবং ভেরিফায়েড টুর্নামেন্টের সাথে যুক্ত।',
    enterArena: 'অ্যারেনায় প্রবেশ করুন',
    signInTab: 'সাইন ইন',
    createAccountTab: 'অ্যাকাউন্ট খুলুন',
    welcomeBack: 'স্বাগতম',
    welcomeBackSub: 'আপনার ক্যারম ক্লাব ও লাইভ ফিডে যোগ দিতে সাইন ইন করুন।',
    joinCarromHub: 'ক্যারম হাবে যোগ দিন',
    joinCarromHubSub: 'আপনার প্লেয়ার প্রোফাইল তৈরি করুন এবং সবার সাথে যুক্ত হোন।',
    continueGoogle: 'Google দিয়ে চালিয়ে যান',
    signInBtn: 'ক্যারম হাবে প্রবেশ করুন',
    // Sections & Views
    exploreTitle: 'ক্যারম হাব এক্সপ্লোর',
    exploreSub: 'সেরা খেলোয়াড় এবং ট্রেন্ডিং পোস্ট খুঁজে বের করুন।',
    messagesTitle: 'মেসেজ',
    groupsTitle: 'ক্যারম কমিউনিটি গ্রুপ',
    groupsSub: 'আঞ্চলিক ক্লাবে যোগ দিন, স্কোয়াডকে চ্যালেঞ্জ করুন এবং খেলোয়াড়দের সাথে চ্যাট করুন।',
    createGroup: 'গ্রুপ তৈরি করুন',
    tournamentsTitle: 'টুর্নামেন্ট',
    tournamentsSub: 'ক্যারম টুর্নামেন্টে অংশ নিন এবং ভেরিফায়েড শিরোপা জিতুন।',
    createTournament: 'টুর্নামেন্ট খুলুন',
    leaderboard: 'লিডারবোর্ড',
    markAllRead: 'সব পড়া হয়েছে',
    editProfile: 'প্রোফাইল এডিট',
    privacySettings: 'প্রাইভেসি সেটিংস',
    follow: 'ফলো করুন',
    followingState: 'ফলো করা হচ্ছে',
    messageBtn: 'মেসেজ',
    emailLabel: 'ইমেইল ঠিকানা',
    phoneLabel: 'মোবাইল নাম্বার',
    phonePlaceholder: '01XXXXXXXXX',
    passwordLabel: 'পাসওয়ার্ড',
    rememberMe: 'মনে রাখুন',
    forgotPassword: 'পাসওয়ার্ড ভুলে গেছেন?',
    orContinueWith: 'অথবা',
    fullNameLabel: 'আপনার নাম',
    usernameLabel: 'ইউজারনেম',
    confirmPasswordLabel: 'পাসওয়ার্ড নিশ্চিত করুন',
    termsAccept: 'আমি ক্যারম হাবের কমিউনিটি গাইডলাইন ও শর্তাবলী মেনে নিচ্ছি।',
    recoverTab: 'রিকভারি',
    recoverTitle: 'পাসওয়ার্ড রিকভারি',
    recoverSub: 'আপনার নিবন্ধিত ইমেইল দিন, আমরা পাসওয়ার্ড রিসেট করার লিংক পাঠিয়ে দেবো।',
    sendResetBtn: 'রিসেট লিংক পাঠান',
    resetSentTitle: 'রিসেট লিংক পাঠানো হয়েছে',
    resetSentDesc: '{email} ঠিকানায় পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে। আপনার ইনবক্স এবং Spam ফোল্ডার চেক করুন।',
    resendResetBtn: 'আবার রিসেট লিংক পাঠান',
    backToSignIn: 'সাইন ইন-এ ফিরে যান',
    demoSectionTitle: 'ডেমো অ্যাকাউন্ট (পারমিশনসহ)',
    demoGoogleBtn: 'ডেমো লগইন (indhassan6050@gmail.com)',
    fillDemoEmail: 'ডেমো ইমেইল বসান',
    optionalPhoto: 'প্রোফাইল ছবি (ঐচ্ছিক)',
    tapToUploadPhoto: 'ছবি দিতে ট্যাপ করুন',
    verifyEmailTitle: 'ইমেইল ভেরিফাই করুন',
    verifyEmailDesc: '{email} ঠিকানায় একটি ভেরিফিকেশন লিংক পাঠানো হয়েছে। ইনবক্স থেকে লিংকে ক্লিক করে নিচে চালিয়ে যান।',
    verifiedContinueBtn: 'ইমেইল ভেরিফাই করেছি',
    resendVerifyBtn: 'আবার ভেরিফিকেশন ইমেইল পাঠান',
    resendWaitBtn: 'পাঠানো হয়েছে (৩০ সেকেন্ড অপেক্ষা করুন)',
    useAnotherAccount: 'সাইন আউট করে অন্য অ্যাকাউন্ট ব্যবহার করুন',
    facebookLabel: 'ফেসবুক প্রোফাইল / ইউজারনেম',
    tiktokLabel: 'টিকটক প্রোফাইল / ইউজারনেম',
    instagramLabel: 'ইনস্টাগ্রাম প্রোফাইল / ইউজারনেম',
    socialProfiles: 'সোশ্যাল মিডিয়া প্রোফাইল',
    viewPublicProfile: 'পাব্লিক প্রোফাইল প্রিভিউ',
    backToEditProfile: 'নিয়ন্ত্রণ ও এডিটে ফিরুন',
    // Notifications / Explore / Chat / Groups / Tournaments / Profile extras
    allCaughtUp: 'সব আপডেট দেখা হয়ে গেছে',
    unreadUpdates: '{count}টি অপঠিত আপডেট',
    noNotificationsDesc: 'লাইক, কমেন্ট, নতুন ফলোয়ার, মেসেজ ও টুর্নামেন্টের আপডেট এখানে দেখাবে।',
    allDiscovery: 'সব কিছু',
    playersTab: 'খেলোয়াড়',
    trendingPosts: 'ট্রেন্ডিং পোস্ট',
    popularPlayers: 'জনপ্রিয় খেলোয়াড়',
    suggestedFriends: 'সাজেস্টেড বন্ধু',
    newMembers: 'নতুন সদস্য',
    popularCommunities: 'জনপ্রিয় ক্লাব',
    openClubs: 'সব ক্লাব',
    searchChats: 'চ্যাট খুঁজুন...',
    onlineNow: 'অনলাইন',
    offlineStatus: 'অফলাইন',
    typeMessage: 'মেসেজ লিখুন...',
    recordingVoice: 'ভয়েস রেকর্ড হচ্ছে...',
    backToClubs: 'ক্লাবসমূহে ফিরুন',
    openGroupChat: 'গ্রুপ চ্যাট খুলুন',
    joinGroup: 'গ্রুপে যোগ দিন',
    leaveGroup: 'গ্রুপ ছাড়ুন',
    clubMembers: 'ক্লাব সদস্য',
    postToClub: 'ক্লাবে পোস্ট করুন',
    backToTournaments: 'টুর্নামেন্টে ফিরুন',
    joinTournament: 'টুর্নামেন্টে যোগ দিন',
    submitMatchResult: 'ম্যাচ ফলাফল জমা দিন',
    followersLabel: 'ফলোয়ার',
    followingLabel: 'ফলোয়িং',
    totalPostsLabel: 'মোট পোস্ট',
    titlesWonLabel: 'শিরোপা জয়',
    postsHeading: 'পোস্টসমূহ',
    backToFeed: 'ফিডে ফিরুন',
    inboxTitle: 'ইনবক্স',
    inboxSub: 'সরাসরি চ্যাট, স্কোয়াড গ্রুপ ও অনলাইন খেলোয়াড়',
    activePlayersNow: 'এখন সক্রিয় খেলোয়াড়',
    allChats: 'সব',
    unreadChats: 'অপঠিত',
    directChats: 'প্রাইভেট',
    groupChats: 'গ্রুপ',
    newChatBtn: 'নতুন চ্যাট',
    newGroupBtn: 'নতুন গ্রুপ',
    totalChatsStat: 'মোট চ্যাট',
    unreadStat: 'অপঠিত',
    onlinePlayersStat: 'অনলাইন',
    inboxWelcomeTitle: 'আপনার ক্যারম ইনবক্স',
    inboxWelcomeDesc: 'খেলোয়াড়দের সাথে সরাসরি মেসেজ করুন, শটের ছবি/ভিডিও ও ভয়েস নোট পাঠান এবং স্কোয়াড গ্রুপে ম্যাচের পরিকল্পনা করুন।',
    quickStartPlayers: 'সক্রিয় খেলোয়াড়দের দ্রুত মেসেজ করুন',
    searchPlayersPlaceholder: 'নাম বা @ইউজারনেম দিয়ে খেলোয়াড় খুঁজুন...',
    noMatchingChats: 'কোনো চ্যাট পাওয়া যায়নি',
    noMatchingChatsDesc: 'অন্য ফিল্টার চেষ্টা করুন অথবা নতুন কোনো খেলোয়াড়ের সাথে চ্যাট শুরু করুন।',
    recentMessagers: 'যারা মেসেজ করেছেন',
    openLink: 'লিংক খুলুন',
    replyAction: 'রিপ্লাই',
    emojiAction: 'ইমোজি',
    deleteAction: 'ডিলিট',
    cameraPhoto: 'ছবি তুলুন (ক্যামেরা)',
    galleryPhoto: 'ফটো আপলোড (গ্যালারি)',
    shareVideo: 'ভিডিও আপলোড',
    appPermissions: 'অ্যাপ পারমিশন',
    permissionsSubtitle: 'ফোনে ভয়েস মেসেজ, ছবি তোলা ও ফটো আপলোডের জন্য মাইক্রোফোন ও ক্যামেরা পারমিশন দিন।',
    micPermTitle: 'ভয়েস ও মাইক্রোফোন পারমিশন',
    micPermDesc: 'চ্যাটে ভয়েস মেসেজ রেকর্ড করে পাঠানোর জন্য প্রয়োজন।',
    cameraPermTitle: 'ফটো ও ক্যামেরা পারমিশন',
    cameraPermDesc: 'সরাসরি ছবি তোলা এবং ফটো বা ভিডিও আপলোড করার জন্য প্রয়োজন।',
    notifPermTitle: 'নোটিফিকেশন পারমিশন',
    notifPermDesc: 'নতুন মেসেজ ও রিপ্লাইয়ের সাথে সাথে অ্যালার্ট পাওয়ার জন্য।',
    allowBtn: 'অনুমতি দিন',
    grantedLabel: 'চালু আছে',
    blockedLabel: 'সেটিংস থেকে ব্লক করা',
    allowAllPerms: 'ভয়েস ও ফটো পারমিশন দিন',
    installAppBtn: 'অ্যাপ ডাউনলোড / ইনস্টল',
    takePhotoTitle: 'ক্যামেরা দিয়ে ছবি তুলুন',
    snapPhoto: 'ছবি তুলে পাঠান',
    switchCamera: 'ক্যামেরা ঘোরান',
    recordingCancel: 'বাতিল',
    recordingSend: 'ভয়েস পাঠান',
    permissionsBannerTitle: 'ফোনের অ্যাপ পারমিশন চালু করুন',
    permissionsBannerDesc: 'ভয়েস মেসেজ ও ফটো আপলোড নির্বিঘ্নে করতে মাইক্রোফোন ও ফটো পারমিশন দিন।',
    managePermissions: 'পারমিশন',
    iosInstallTitle: 'আইফোনে ক্যারম হাব ইনস্টল করুন',
    iosInstallSteps: 'Safari-এর Share বাটনে ট্যাপ করে "Add to Home Screen" সিলেক্ট করুন।',
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.en;

interface PreferencesContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  toggleLang: () => void;
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  t: (key: TranslationKey, vars?: Record<string, string>) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem('carrom_lang');
      return saved === 'bn' ? 'bn' : 'en';
    } catch {
      return 'en';
    }
  });

  const [theme, setThemeState] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem('carrom_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('carrom_lang', lang);
      document.documentElement.lang = lang;
    } catch {
      // ignore storage errors
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('carrom_theme', theme);
    } catch {
      // ignore storage errors
    }
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const setLang = (next: AppLanguage) => setLangState(next);
  const toggleLang = () => setLangState((prev) => (prev === 'en' ? 'bn' : 'en'));
  const setTheme = (next: AppTheme) => setThemeState(next);
  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const t = (key: TranslationKey, vars?: Record<string, string>): string => {
    let text: string = TRANSLATIONS[lang][key] || TRANSLATIONS.en[key] || key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, v);
      }
    }
    return text;
  };

  return (
    <PreferencesContext.Provider
      value={{ lang, setLang, toggleLang, theme, setTheme, toggleTheme, t }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return ctx;
}
