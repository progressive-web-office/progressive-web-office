/**
 * PDF-020: the SHA-256 of each file the typeset PDF downloads — the engine
 * (WebAssembly, executable code) and the fonts — checked before it is used
 * or kept, as Pyodide checks its wheels. Paths are under https://cdn.jsdelivr.net/.
 */
export const TYPST_HASHES: Record<string, string> = {
  'npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm': '1fc968438a672366dfec39c96c842c26ed29caff4eb1bcaab19a6c60867de5fd',
  'npm/@expo-google-fonts/carlito@0.4.1/400Regular/Carlito_400Regular.ttf': 'ca019755404c45627a8566915df99068949dc32ee2bce48d6aeee7542d2a0a89',
  'npm/@expo-google-fonts/carlito@0.4.1/400Regular_Italic/Carlito_400Regular_Italic.ttf': '074cd1b89d53765d90d0ed3b4bfe49523efaaf4f3f430c006bc3233778b0ebb5',
  'npm/@expo-google-fonts/carlito@0.4.1/700Bold/Carlito_700Bold.ttf': '51edbfa32d8af939913ae1f4ad0a5173e32083499218c133384638090295f0b0',
  'npm/@expo-google-fonts/carlito@0.4.1/700Bold_Italic/Carlito_700Bold_Italic.ttf': '25f5672c1985d168d6bc2973864fc5a7e374bb95fe8d0f91cff47ae17fa67691',
  'npm/@expo-google-fonts/arimo@0.4.3/400Regular/Arimo_400Regular.ttf': '88cc899855d30f9c779b73c3319d0e077b098f927187aafce11ca029add707a6',
  'npm/@expo-google-fonts/arimo@0.4.3/400Regular_Italic/Arimo_400Regular_Italic.ttf': '6bd2c6a6fa87f4566cf0a92c5834884597acbd7be9719e550837865ac4167a42',
  'npm/@expo-google-fonts/arimo@0.4.3/700Bold/Arimo_700Bold.ttf': 'ec96ac9fdd94766f66f6140c1375bf011577558f88d43f76b3b59307d2a6bca3',
  'npm/@expo-google-fonts/arimo@0.4.3/700Bold_Italic/Arimo_700Bold_Italic.ttf': 'b42b19c10bf5d526f00068303a643282c3df55a79c6fa2eea80b4a078a4a705a',
  'npm/@expo-google-fonts/tinos@0.4.2/400Regular/Tinos_400Regular.ttf': '924ef269e73da94c1803ff68877f5d998dd16605c5ffad82ee181034f8a1fffe',
  'npm/@expo-google-fonts/tinos@0.4.2/400Regular_Italic/Tinos_400Regular_Italic.ttf': '4a52de5bcf70e37bd71949f8a85302b75795a1943aedffbbee4f2db7744e1c81',
  'npm/@expo-google-fonts/tinos@0.4.2/700Bold/Tinos_700Bold.ttf': '576a19b5dc026cafe6ae8fde4c849588dae6475cf5d912cebdf2827388c43ad9',
  'npm/@expo-google-fonts/tinos@0.4.2/700Bold_Italic/Tinos_700Bold_Italic.ttf': '10c90ef7896d758923c06a1485d7824cdb457466da0bf7d42f81c5228931281b',
  'npm/@expo-google-fonts/cousine@0.4.3/400Regular/Cousine_400Regular.ttf': 'ca2264d6750d6c47df703be4486361a37ab943d42de6ea2bf794b7c7af767799',
  'npm/@expo-google-fonts/cousine@0.4.3/400Regular_Italic/Cousine_400Regular_Italic.ttf': 'f1626b7287db36af8ba2ff88840c82f121f4cbda8971fe3f717f975e9fd782a8',
  'npm/@expo-google-fonts/cousine@0.4.3/700Bold/Cousine_700Bold.ttf': 'f03c46c4bc5c0a3af4a1f4fbe5e3e16954581cced05cea20b3bffe12740d99d3',
  'npm/@expo-google-fonts/cousine@0.4.3/700Bold_Italic/Cousine_700Bold_Italic.ttf': 'acb798f3629cda0041fbd6234237cf549a1b932792f2a71b0986eb3e1382ed37',
  'npm/@expo-google-fonts/caladea@0.4.2/400Regular/Caladea_400Regular.ttf': '59faf27a90dee5c1b7813b12b26c725ea88adc1bfe37b0ac8e0b8b32a5732c2a',
  'npm/@expo-google-fonts/caladea@0.4.2/400Regular_Italic/Caladea_400Regular_Italic.ttf': '669e65b265d40899b59d7f3531ca136b7e0fda80a3d1b5d47bbe7825be81fbe3',
  'npm/@expo-google-fonts/caladea@0.4.2/700Bold/Caladea_700Bold.ttf': '11d1e1dc461d1e491b6a396d91934c3bb09d06a77cc3d21ad0b10346c39c3ec2',
  'npm/@expo-google-fonts/caladea@0.4.2/700Bold_Italic/Caladea_700Bold_Italic.ttf': '93d7c2003fe3fd8381cbd518af6cc2f4b510a37c7741c49a95893b6da8edbbc7',
  'gh/typst/typst-assets@v0.14.2/files/fonts/LibertinusSerif-Regular.otf': 'fcf06307a77367394fcb0ccb241e59eea70dba3d732be309647611224679c733',
  'gh/typst/typst-assets@v0.14.2/files/fonts/LibertinusSerif-Italic.otf': '9a393d63d6e05f620d3dc0190dfd35a8ede58c0808cf0fc9de7fcb9c723e4c24',
  'gh/typst/typst-assets@v0.14.2/files/fonts/LibertinusSerif-Bold.otf': '0264914210ed51b3231ebc92ce529e9f2e166ba9eebf0cd4a579558690a27b64',
  'gh/typst/typst-assets@v0.14.2/files/fonts/LibertinusSerif-BoldItalic.otf': '47a665259f09f554f5d133d7718cdad43ff462c6a6b2328f38023465e62d57ce',
  'gh/typst/typst-assets@v0.14.2/files/fonts/NewCMMath-Regular.otf': 'ad746f5307fed53d8e5d7d201f5054abe73f1f47c51040767d898e3481c6e648',
};
