/**
 * CODE-018: completion for the languages without a language service (Lua, R,
 * C/C++, SQL): their keywords and usual functions, and the words of the code
 * (SQL keywords come with its grammar). CODE-020: the same for the languages
 * shown and edited only — Bash, PowerShell, Julia and the most used ones;
 * the others complete with the words of the code.
 */
import { completeAnyWord, completeFromList, type Completion, type CompletionSource } from '@codemirror/autocomplete';
import { EditorState, type Extension } from '@codemirror/state';

const list = (type: string, words: string): Completion[] => words.split(/\s+/).filter(Boolean).map((label) => ({ label, type }));

const WORDS: Partial<Record<string, Completion[]>> = {
  lua: [
    ...list('keyword', 'and break do else elseif end false for function goto if in local nil not or repeat return then true until while'),
    ...list('function', 'assert collectgarbage dofile error getmetatable ipairs load loadfile next pairs pcall print rawequal rawget rawlen rawset require select setmetatable tonumber tostring type xpcall'),
    ...list('namespace', 'coroutine debug io math os package string table utf8'),
    ...list(
      'method',
      'string.format string.sub string.gsub string.gmatch string.find string.match string.rep string.upper string.lower string.len string.byte string.char table.insert table.remove table.concat table.sort table.unpack math.floor math.ceil math.max math.min math.abs math.sqrt math.random math.pi math.huge io.write io.read io.open os.time os.clock os.date',
    ),
  ],
  r: [
    ...list('keyword', 'if else for while repeat function return next break TRUE FALSE NULL NA NaN Inf in library require'),
    ...list(
      'function',
      'c list vector matrix data.frame factor seq seq_len seq_along rep length names nrow ncol dim head tail summary str print cat paste paste0 sprintf format mean median sd var min max sum prod range quantile table unique sort order rev which apply sapply lapply vapply mapply tapply aggregate merge subset with within lm glm predict residuals coef anova t.test chisq.test cor plot hist boxplot barplot lines points abline legend par read.csv write.csv readLines writeLines source setwd getwd file.path nchar substr strsplit gsub sub grepl toupper tolower round floor ceiling sqrt exp log abs is.na ifelse stop warning tryCatch invisible commandArgs',
    ),
  ],
  cpp: [
    ...list(
      'keyword',
      'auto break case char class const constexpr continue default delete do double else enum explicit extern false float for friend if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this true typedef typename union unsigned using virtual void volatile while bool',
    ),
    ...list('function', 'printf scanf puts putchar getchar fopen fclose fprintf fscanf fgets malloc calloc realloc free memcpy memset strlen strcpy strcmp strcat sqrt pow abs fabs exit main'),
    ...list(
      'type',
      'std::vector std::string std::map std::unordered_map std::set std::pair std::array std::cout std::cin std::endl std::sort std::find std::max std::min std::swap std::accumulate std::begin std::end std::size_t std::unique_ptr std::make_unique std::shared_ptr size_t',
    ),
    ...list('keyword', '#include #define #ifdef #ifndef #endif #pragma'),
  ],
  bash: [
    ...list('keyword', 'if then else elif fi for while until do done case esac in function select time return break continue local export readonly declare typeset unset shift source exit trap'),
    ...list(
      'function',
      'echo printf read cd pwd ls cp mv rm mkdir rmdir touch cat less head tail grep sed awk sort uniq wc cut tr find xargs tee chmod chown ln tar gzip gunzip zip unzip curl wget ssh scp rsync git ps kill top df du date sleep which whoami env test true false basename dirname realpath mktemp diff patch make sudo apt dnf pacman brew pip python3 npm',
    ),
    ...list('variable', '$HOME $PATH $PWD $USER $SHELL $IFS $RANDOM $? $# $@ $* $0 $1 $2'),
  ],
  powershell: [
    ...list('keyword', 'begin break catch class continue data do dynamicparam else elseif end enum exit filter finally for foreach function if in param process return switch throw trap try until using while -eq -ne -gt -ge -lt -le -like -notlike -match -notmatch -contains -notcontains -in -notin -and -or -not -is -as'),
    ...list(
      'function',
      'Get-ChildItem Get-Content Set-Content Add-Content Get-Item Set-Item Remove-Item Copy-Item Move-Item New-Item Rename-Item Test-Path Join-Path Split-Path Resolve-Path Get-Location Set-Location Push-Location Pop-Location Get-Process Stop-Process Start-Process Get-Service Start-Service Stop-Service Restart-Service Get-Command Get-Help Get-Member Get-Date Get-Random Write-Host Write-Output Write-Error Write-Warning Write-Verbose Read-Host Select-Object Where-Object ForEach-Object Sort-Object Group-Object Measure-Object Format-Table Format-List Out-File Out-String Export-Csv Import-Csv ConvertTo-Json ConvertFrom-Json Invoke-WebRequest Invoke-RestMethod Invoke-Command New-Object Import-Module Get-Module Set-ExecutionPolicy Start-Sleep',
    ),
    ...list('variable', '$_ $PSItem $true $false $null $args $env:PATH $HOME $PSScriptRoot $PSVersionTable $Error'),
  ],
  julia: [
    ...list('keyword', 'function end if elseif else for while do begin let return break continue module baremodule using import export struct mutable abstract primitive type const global local macro quote try catch finally where in isa true false nothing missing'),
    ...list(
      'function',
      'println print show display string length size eltype typeof push! pop! append! insert! deleteat! sort sort! sum prod maximum minimum extrema mean median std var collect map map! filter reduce foldl foldr zip enumerate eachindex keys values pairs haskey get get! isempty first last range zeros ones fill rand randn reshape vcat hcat cat transpose inv det abs sqrt exp log sin cos tan floor ceil round parse tryparse convert promote isnothing ismissing occursin split join replace uppercase lowercase strip readline readlines open close write @time @show @assert @inbounds @views @printf',
    ),
  ],
  java: [
    ...list('keyword', 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try var void volatile while record sealed permits yield true false null'),
    ...list('type', 'String Integer Long Double Boolean Character Object List ArrayList Map HashMap Set HashSet Optional Stream Collectors Arrays Math System Scanner Exception RuntimeException Thread'),
    ...list('function', 'System.out.println System.out.printf String.format Math.max Math.min Math.abs Math.sqrt Arrays.asList List.of Map.of'),
  ],
  csharp: [
    ...list('keyword', 'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly record ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await yield get set init'),
    ...list('function', 'Console.WriteLine Console.ReadLine Console.Write String.Format Math.Max Math.Min Math.Abs Math.Sqrt Task.Run List Dictionary IEnumerable LINQ Select Where OrderBy ToList'),
  ],
  typescript: [
    ...list('keyword', 'abstract any as async await boolean break case catch class const continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of private protected public readonly return satisfies set static string super switch symbol this throw true try type typeof undefined unique unknown var void while yield'),
    ...list('function', 'console.log console.error JSON.stringify JSON.parse Object.keys Object.entries Array.from Promise.all Math.max Math.min setTimeout fetch'),
  ],
  vb: [
    ...list('keyword', 'AddHandler AndAlso And As Boolean ByRef ByVal Call Case Catch Class Const Continue Date Decimal Declare Default Dim Do Double Each Else ElseIf End Enum Event Exit False Finally For Friend Function Get Handles If Implements Imports In Inherits Integer Interface Is IsNot Let Long Loop Me Module MustInherit MustOverride MyBase Namespace New Next Not Nothing Object Of On Option Optional Or OrElse Overrides ParamArray Private Property Protected Public RaiseEvent ReadOnly ReDim Return Select Set Shared Short Single Static Step String Structure Sub Then Throw To True Try TypeOf Until Using When While With WriteOnly'),
    ...list('function', 'MsgBox InputBox Console.WriteLine Debug.Print CStr CInt CDbl Len Left Right Mid Trim UCase LCase InStr Replace Split Join Now Format'),
  ],
  rust: [
    ...list('keyword', 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'),
    ...list('type', 'i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Some None Result Ok Err Box Rc Arc HashMap HashSet'),
    ...list('function', 'println! print! format! vec! panic! assert! assert_eq! dbg! unwrap expect clone iter into_iter map filter collect len push'),
  ],
  go: [
    ...list('keyword', 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil iota'),
    ...list('type', 'bool byte rune int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 complex64 complex128 string error any'),
    ...list('function', 'fmt.Println fmt.Printf fmt.Sprintf fmt.Errorf errors.New len cap append make new panic recover close copy delete strings.Split strings.Join strconv.Itoa strconv.Atoi'),
  ],
  fortran: [
    ...list('keyword', 'program end module contains use implicit none integer real double precision complex logical character parameter dimension allocatable allocate deallocate intent in out inout function subroutine call return if then else elseif endif do enddo while exit cycle select case stop print write read open close format type interface pure elemental result'),
    ...list('function', 'abs sqrt exp log log10 sin cos tan atan2 mod min max sum product size shape reshape matmul transpose dot_product maxval minval present allocated real int nint trim len_trim adjustl'),
  ],
  pascal: [
    ...list('keyword', 'program unit interface implementation uses begin end var const type procedure function if then else case of for to downto do while repeat until with record array set string integer real boolean char true false nil not and or div mod try except finally raise class object constructor destructor private public protected published property inherited'),
    ...list('function', 'WriteLn Write ReadLn Read Length Copy Pos Inc Dec Ord Chr IntToStr StrToInt FloatToStr Format High Low SetLength Exit Halt'),
  ],
  php: [
    ...list('keyword', 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for foreach function global if implements include include_once instanceof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while yield true false null'),
    ...list('function', 'strlen str_replace explode implode array_map array_filter array_keys array_values count in_array json_encode json_decode var_dump print_r htmlspecialchars sprintf date'),
  ],
  swift: [
    ...list('keyword', 'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch false is nil self Self super throw throws true try async await'),
    ...list('function', 'print debugPrint String Int Double Bool Array Dictionary Set Optional map filter reduce sorted count isEmpty append'),
  ],
  kotlin: [
    ...list('keyword', 'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while by catch constructor data enum finally get import init lateinit open override private protected public sealed set suspend companion'),
    ...list('function', 'println print listOf mutableListOf mapOf mutableMapOf setOf arrayOf let apply also run with require check error lazy'),
  ],
  ruby: [
    ...list('keyword', 'BEGIN END alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield attr_accessor attr_reader require require_relative'),
    ...list('function', 'puts print p gets each map select reject reduce each_with_index times upto length size include? push pop join split to_s to_i to_f'),
  ],
  perl: [
    ...list('keyword', 'my our local sub if elsif else unless while until for foreach last next redo return use require package BEGIN END do eval and or not'),
    ...list('function', 'print printf say chomp chop split join push pop shift unshift sort reverse keys values each exists delete defined length substr index open close die warn'),
  ],
  matlab: [
    ...list('keyword', 'if elseif else end for while switch case otherwise function return break continue try catch global persistent'),
    ...list('function', 'disp fprintf sprintf plot figure hold xlabel ylabel title legend grid subplot zeros ones eye rand randn linspace size length numel sum mean max min abs sqrt exp log sin cos tan inv det transpose tf step bode impulse lsim feedback'),
  ],
  ada: [
    ...list('keyword', 'with use package body procedure function is begin end if then elsif else case when others loop for while in out return declare type subtype record array of range access new null constant exception raise task protected entry accept select'),
    ...list('function', 'Put_Line Put Get New_Line Ada.Text_IO Ada.Integer_Text_IO Integer\'Image Integer\'Value'),
  ],
  cobol: [
    ...list('keyword', 'IDENTIFICATION DIVISION PROGRAM-ID ENVIRONMENT DATA WORKING-STORAGE SECTION PROCEDURE PIC VALUE DISPLAY ACCEPT MOVE TO ADD SUBTRACT MULTIPLY DIVIDE COMPUTE IF ELSE END-IF PERFORM UNTIL VARYING STOP RUN'),
  ],
  asm: [
    ...list('keyword', 'mov add sub mul imul div idiv inc dec cmp jmp je jne jz jnz jg jge jl jle call ret push pop lea and or xor not shl shr nop int syscall section global extern db dw dd dq'),
    ...list('variable', 'eax ebx ecx edx esi edi esp ebp rax rbx rcx rdx rsi rdi rsp rbp r8 r9 r10 r11 r12 r13 r14 r15'),
  ],
};

const sources = new Map<WordLang, CompletionSource[]>();

/**
 * Completion sources of a language: its words, then the words of the code.
 * The same functions each time: completion knows a source by its identity.
 */
export function wordSources(lang: WordLang): CompletionSource[] {
  let found = sources.get(lang);
  if (!found) {
    const words = WORDS[lang];
    sources.set(lang, (found = words ? [completeFromList(words), completeAnyWord] : [completeAnyWord]));
  }
  return found;
}

/** The sources, given as language data so that they come with the language's own (SQL keywords). */
export function wordCompletion(lang: WordLang): Extension {
  const data = wordSources(lang).map((autocomplete) => ({ autocomplete }));
  return EditorState.languageData.of(() => data);
}

/** Any language: those without a list complete with the words of the code (SQL's keywords come with its grammar). */
export type WordLang = string;
export const hasWords = (lang: string): boolean => lang in WORDS || lang === 'sql';
